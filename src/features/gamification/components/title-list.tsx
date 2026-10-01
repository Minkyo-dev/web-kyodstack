"use client";

import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { equipTitleAction } from "../actions/quest.actions";
import { TITLES } from "../utils/achievements";

/** Unlocked titles; one can be equipped (E2 spec §3). */
export function TitleList({ titles, equipped }: { titles: { key: string }[]; equipped: string | null }) {
  const { run, pending } = useActionRunner();
  return (
    <section aria-labelledby="titles-heading" className="space-y-2">
      <h2 id="titles-heading" className="text-lg font-semibold">
        칭호
      </h2>
      {titles.length === 0 ? (
        <p className="text-sm text-muted-foreground">업적을 달성하면 칭호가 열립니다.</p>
      ) : (
        <ul className="max-w-lg divide-y divide-border rounded-md border border-border">
          {titles.map((t) => {
            const on = t.key === equipped;
            return (
              <li key={t.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 font-mono text-xs tracking-wider">{TITLES[t.key] ?? t.key}</span>
                {on && <span className="text-xs text-muted-foreground">장착 중</span>}
                <Button
                  size="xs"
                  variant={on ? "ghost" : "outline"}
                  disabled={pending}
                  aria-label={`${TITLES[t.key] ?? t.key} ${on ? "해제" : "장착"}`}
                  onClick={() => run(() => equipTitleAction({ titleKey: on ? null : t.key }), { success: on ? "칭호를 해제했습니다." : "칭호를 장착했습니다." })}
                >
                  {on ? "해제" : "장착"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
