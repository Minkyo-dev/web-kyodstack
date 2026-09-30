"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { enableGamificationAction } from "../actions/gamification.actions";

export function EnableCard() {
  const { run, pending } = useActionRunner();
  return (
    <section aria-labelledby="player-heading" className="space-y-2 rounded-md border border-border p-4">
      <h2 id="player-heading" className="text-lg font-semibold">게임 요소</h2>
      <p className="text-sm text-muted-foreground">
        집중·완료·약속 지킴에 XP를 주고 레벨을 표시합니다. XP는 능력이 아니라 활동량입니다. 켜면 지금까지의 기록으로 시작 레벨을 계산합니다.
      </p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => enableGamificationAction(), { onSuccess: (r) => toast.success(`지금까지 기록으로 Lv.${r.level}에서 시작`) })}
      >
        {pending ? "계산 중…" : "게임 요소 켜기"}
      </Button>
    </section>
  );
}
