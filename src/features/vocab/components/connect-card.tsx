import { BookOpenText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

/** First visit: what connecting does. A plain <a>: the route handler redirects to Notion (no prefetch). */
export function ConnectCard() {
  return (
    <section className="max-w-xl space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <BookOpenText className="size-5 text-primary" aria-hidden />
        <h2 className="font-semibold">Notion을 단어장으로 쓰기</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Notion 계정을 연결하고 페이지 하나를 공유하면, 그 아래에 단어장 데이터베이스를 만들어 드려요. 단어는 Notion과 이 앱 어디서
        고쳐도 함께 반영됩니다.
      </p>
      <a href="/api/notion/connect" className={buttonVariants()}>
        Notion 연결
      </a>
    </section>
  );
}
