"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/hooks/use-action-runner";
import { updateGamificationSettingsAction } from "../actions/gamification.actions";
import type { PlayerProfile } from "../queries/xp.queries";

export function GamificationSettingsDialog({ profile }: { profile: PlayerProfile }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useActionRunner();
  const [v, setV] = useState({
    gamification_enabled: profile.gamification_enabled,
    animations_enabled: profile.animations_enabled,
    achievement_toasts: profile.achievement_toasts,
  });
  const row = (key: keyof typeof v, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={v[key]} onChange={(e) => setV((s) => ({ ...s, [key]: e.target.checked }))} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
  return (
    <>
      <Button size="sm" variant="ghost" aria-label="게임 요소 설정" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>게임 요소 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {row("gamification_enabled", "게임 요소", "끄면 레벨·XP 표시가 사라집니다. 기록은 유지됩니다.")}
            {row("animations_enabled", "시스템 애니메이션")}
            {row("achievement_toasts", "업적 알림", "업적은 다음 단계(E2)에서 추가됩니다.")}
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => updateGamificationSettingsAction(v), { success: "저장했습니다.", onSuccess: () => setOpen(false) })
              }
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
