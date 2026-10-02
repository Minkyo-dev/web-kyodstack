"use client";

import { useOptimistic } from "react";
import { useActionRunner } from "@/hooks/use-action-runner";
import { setHabitCheckAction } from "../actions/direction.actions";
import type { HabitToday } from "../domain/direction.types";
import { TERMS } from "@/lib/terms";

/** Today's habits (습관) above the daily quests. Symbols + text, never color alone. */
export function HabitPanel({ habits }: { habits: HabitToday[] }) {
  return (
    <section aria-label={TERMS.habits} className="mx-4 mb-2 rounded-md border border-border text-xs">
      <p className="flex items-center px-3 py-2 font-mono tracking-wider">
        {TERMS.habits}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {habits.filter((h) => h.done).length}/{habits.length}
        </span>
      </p>
      <ul className="space-y-1 border-t border-border px-3 py-2">
        {habits.map((h) => (
          <HabitRow key={h.id} habit={h} />
        ))}
      </ul>
    </section>
  );
}

/** One habit; a tick shows at once (optimistic) and settles when the action and revalidation finish. */
function HabitRow({ habit: h }: { habit: HabitToday }) {
  const { run, pending } = useActionRunner();
  const [done, setDone] = useOptimistic(h.done);
  return (
    <li aria-label={`${TERMS.habit} ${h.title}`} className="flex items-center gap-1.5">
      <span aria-hidden>{done ? "●" : "○"}</span>
      <span className="sr-only">{done ? "완료" : "미완료"}</span>
      <span className={done ? "text-muted-foreground" : undefined}>{h.title}</span>
      {h.missionTitle && (
        <span title={h.missionTitle} className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
          {h.missionTitle.slice(0, 12)}
        </span>
      )}
      <span className="ml-auto flex items-center gap-1 text-muted-foreground tabular-nums">
        {h.rule === "focus" ? (
          `${Math.min(h.focusMinutes ?? 0, h.targetMinutes ?? 0)}/${h.targetMinutes}분 · 자동`
        ) : (
          <input
            type="checkbox"
            aria-label={`${h.title} 완료`}
            checked={done}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              run(async () => {
                setDone(next);
                return setHabitCheckAction({ habitId: h.id, done: next });
              });
            }}
          />
        )}
      </span>
    </li>
  );
}
