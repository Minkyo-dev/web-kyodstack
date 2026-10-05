import Link from "next/link";
import type { TopicCount } from "../queries/word.queries";

/** Topic lists on the home tab (spec §10). V2 adds due counts and [학습]. */
export function TopicCards({ topics }: { topics: TopicCount[] }) {
  if (topics.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 주제가 없어요. 단어에 주제를 달면 여기서 주제별로 모아 볼 수 있어요.</p>;
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => (
        <li key={t.name}>
          <Link
            href={`/english/words?topic=${encodeURIComponent(t.name)}`}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:border-ring/50 hover:bg-accent/40"
          >
            <span className="font-medium">{t.name}</span>
            <span className="text-muted-foreground">{t.count}개</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
