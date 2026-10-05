import type { Metadata } from "next";
import Link from "next/link";
import { Rows3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuickAdd } from "@/features/vocab/components/quick-add";
import { SyncButton } from "@/features/vocab/components/sync-button";
import { WordFilters } from "@/features/vocab/components/word-filters";
import { WordTable } from "@/features/vocab/components/word-table";
import { setupState } from "@/features/vocab/domain/connection";
import { syncLabel } from "@/features/vocab/domain/sync";
import { WORD_LIST_LIMIT, listWords, topicSummary, userTimezone, wordFilterSchema } from "@/features/vocab/queries/word.queries";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { maybePull } from "@/features/vocab/services/sync.service";

export const metadata: Metadata = { title: "단어 · 단어장", robots: { index: false } };

/** Word list (spec §10 단어): filters in the URL, quick add, drawer edit. Renders from the mirror; pulls after. */
export default async function EnglishWordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const view = await getConnectionView(supabase, user.id);
  if (setupState(view) !== "ready") redirect("/english");
  after(() => maybePull({ user, supabase }));

  const sp = await searchParams;
  const filter = wordFilterSchema.parse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) || undefined])));
  const timezone = await userTimezone(supabase, user.id);
  const [{ rows, truncated }, summary] = await Promise.all([listWords(supabase, user.id, filter, timezone), topicSummary(supabase, user.id)]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full items-center gap-2 sm:max-w-md">
          <div className="flex-1">
            <QuickAdd />
          </div>
          <Link href="/english/words/bulk" className={buttonVariants({ variant: "outline" })}>
            <Rows3 aria-hidden />
            일괄 추가
          </Link>
        </div>
        <SyncButton lastSynced={syncLabel(view?.lastPulledAt ?? null, timezone)} />
      </div>
      <WordFilters key={JSON.stringify(filter)} filter={filter} topics={summary.topics} />
      {rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          {filtered ? "조건에 맞는 단어가 없어요." : "아직 단어가 없어요. 위 입력창에 첫 단어를 적어 보세요. Notion에 적은 단어는 동기화하면 나타납니다."}
        </p>
      ) : (
        <WordTable rows={rows} />
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length}개{truncated ? ` (최근 ${WORD_LIST_LIMIT}개만 표시 — 검색이나 필터로 좁혀 보세요)` : ""} · 전체 {summary.total}개
      </p>
    </div>
  );
}
