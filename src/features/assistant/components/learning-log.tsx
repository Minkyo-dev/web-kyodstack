import { BookOpenCheck } from "lucide-react";
import { KIND_LABEL, type ProposalKind } from "../domain/coach";
import { outcomeText } from "../domain/learning";
import type { LearningEntry } from "../queries/learning.queries";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 배운 것 (ADR 0044): what was applied and what happened after, in numbers and one word. */
export function LearningLog({ entries }: { entries: LearningEntry[] }) {
  return (
    <section aria-labelledby="learning-heading" className="space-y-2">
      <h2 id="learning-heading" className="flex items-center gap-1.5 text-lg font-semibold">
        <BookOpenCheck className="size-4" aria-hidden />
        배운 것
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          적용한 코칭 제안이 여기에 쌓여요. 2주가 지나면 적용 전 4주와 비교해 효과가 있었는지 보여 드려요.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {entries.map((e) => (
            <li key={e.id} aria-label={`배운 것 ${e.title}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="text-xs text-muted-foreground">
                {KIND_LABEL[e.kind as ProposalKind] ?? e.kind} · {md(e.decidedDate)} 적용
              </span>
              <span className="w-full text-xs tabular-nums sm:w-auto">{outcomeText(e.outcome)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
