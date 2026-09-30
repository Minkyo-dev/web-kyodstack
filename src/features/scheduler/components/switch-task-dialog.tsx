"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActionRunner } from "@/hooks/use-action-runner";
import { switchWorkSessionAction } from "../actions/work-session.actions";
import type { Task } from "../domain/task.types";
import type { SessionWithTask } from "../domain/work-session.types";
import { focusStats } from "../utils/focus";
import { formatElapsed } from "../utils/metrics";

/** Only one open timer (requirements §13): finish the current one first, or hold it. */
export function SwitchTaskDialog({
  current,
  target,
  onCancel,
  onFinishFirst,
}: {
  current: SessionWithTask | null;
  /** The task to start; with a block, the session is linked to that block. */
  target: { task: Task; blockId?: string } | null;
  onCancel: () => void;
  onFinishFirst: () => void;
}) {
  const { run, pending } = useActionRunner();
  if (!current || !target) return null;
  const elapsed = formatElapsed(focusStats(current, current.pauses).focusedMs);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>작업 전환</DialogTitle>
          <DialogDescription>
            지금 작업 중: {current.task.title} · {elapsed}
            <br />“{target.task.title}”을(를) 시작할까요?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  switchWorkSessionAction(
                    // The block decides the task in start_work_session.
                    target.blockId ? { blockId: target.blockId } : { taskId: target.task.id },
                  ),
                {
                  success: `${current.task.title}은(는) 보류했습니다.`,
                  onSuccess: onCancel,
                },
              )
            }
          >
            보류하고 시작
          </Button>
          <Button disabled={pending} onClick={onFinishFirst}>
            마치고 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
