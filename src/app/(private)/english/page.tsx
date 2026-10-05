import Link from "next/link";
import { after } from "next/server";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ConnectCard } from "@/features/vocab/components/connect-card";
import { ReauthBanner } from "@/features/vocab/components/reauth-banner";
import { SyncButton } from "@/features/vocab/components/sync-button";
import { TodayCard } from "@/features/vocab/components/today-card";
import { TopicCards } from "@/features/vocab/components/topic-cards";
import { setupState } from "@/features/vocab/domain/connection";
import { syncLabel } from "@/features/vocab/domain/sync";
import { topicSummary, userTimezone } from "@/features/vocab/queries/word.queries";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { dueByTopic, loadReviewSession } from "@/features/vocab/services/review.service";
import { maybePull } from "@/features/vocab/services/sync.service";

export default async function EnglishHomePage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const view = await getConnectionView(supabase, user.id);
  const state = setupState(view);

  if (state === "not_connected") return <ConnectCard />;
  if (state === "reauth") return <ReauthBanner />;
  if (state === "pick_page") {
    return (
      <section className="max-w-xl space-y-3 rounded-lg border bg-card p-5 text-sm">
        <p>Notion은 연결됐어요. 단어장 데이터베이스를 만들 페이지를 골라 주세요.</p>
        <Link href="/english/settings" className={buttonVariants()}>
          단어장 만들기
        </Link>
      </section>
    );
  }
  after(() => maybePull({ user, supabase }));
  const ctx = { user, supabase };
  const [summary, timezone, session, due] = await Promise.all([
    topicSummary(supabase, user.id),
    userTimezone(supabase, user.id),
    loadReviewSession(ctx, { kind: "all" }),
    dueByTopic(ctx),
  ]);
  const fresh = session.items.filter((i) => i.state.fsrsState === "new").length;

  return (
    <div className="max-w-5xl space-y-6">
      <TodayCard reviews={session.items.length - fresh} fresh={fresh} />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-5 text-sm">
        <div className="space-y-1">
          <h2 className="font-semibold">Notion 단어장</h2>
          <p className="text-muted-foreground">
            {view?.workspaceName ?? "Notion"} · 단어 {summary.total}개 · 주제 {summary.topics.length}개
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/english/words" className={buttonVariants({ size: "sm" })}>
            단어 보기
          </Link>
          {view?.databaseUrl && (
            <a href={view.databaseUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Notion에서 열기
              <ExternalLink aria-hidden />
            </a>
          )}
        </div>
        <div className="w-full">
          <SyncButton lastSynced={syncLabel(view?.lastPulledAt ?? null, timezone)} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">주제별 단어장</h2>
        <TopicCards topics={summary.topics} due={due} />
      </section>
    </div>
  );
}
