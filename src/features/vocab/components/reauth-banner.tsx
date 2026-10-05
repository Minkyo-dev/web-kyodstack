import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

export function ReauthBanner() {
  return (
    <div role="alert" className="flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Notion 연결이 만료됐어요. 단어 내용을 고치려면 다시 연결해 주세요.</span>
      <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
        다시 연결
      </a>
    </div>
  );
}
