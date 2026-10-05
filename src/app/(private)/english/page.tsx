import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ConnectCard } from "@/features/vocab/components/connect-card";
import { ReauthBanner } from "@/features/vocab/components/reauth-banner";
import { setupState } from "@/features/vocab/domain/connection";
import { getConnectionView } from "@/features/vocab/services/connection.service";

export default async function EnglishHomePage() {
  const user = await requireUserOrRedirect();
  const view = await getConnectionView(await createClient(), user.id);
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
  return (
    <section className="max-w-xl space-y-2 rounded-lg border bg-card p-5 text-sm">
      <h2 className="font-semibold">Notion 단어장</h2>
      <p className="text-muted-foreground">{view?.workspaceName ?? "Notion"}의 &lsquo;Kyod 단어장&rsquo;과 연결돼 있어요. 단어 목록과 복습은 다음 단계에서 이 화면에 표시됩니다.</p>
      {view?.databaseUrl && (
        <a href={view.databaseUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Notion에서 열기
          <ExternalLink aria-hidden />
        </a>
      )}
    </section>
  );
}
