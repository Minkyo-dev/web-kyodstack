import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import type { TopicCount } from "../queries/word.queries";

/** Topic lists on the home tab (spec §10): word count, cards due today, [학습] and [보기]. */
export function TopicCards({ topics, due }: { topics: TopicCount[]; due: Map<string, number> }) {
  if (topics.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 주제가 없어요. 단어에 주제를 달면 여기서 주제별로 모아 볼 수 있어요.</p>;
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => {
        const dueCount = due.get(t.name) ?? 0;
        return (
          <li key={t.name} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.count}개 · 오늘 복습 {dueCount}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Link href={`/english/review?scope=${encodeURIComponent(`topic:${t.name}`)}`} className={buttonVariants({ size: "sm", variant: dueCount > 0 ? "default" : "outline" })} aria-label={`${t.name} 학습`}>
                학습
              </Link>
              <Link href={`/english/words?topic=${encodeURIComponent(t.name)}`} className={buttonVariants({ size: "sm", variant: "ghost" })} aria-label={`${t.name} 단어 보기`}>
                보기
              </Link>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
