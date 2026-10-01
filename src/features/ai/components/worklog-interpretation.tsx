"use client";

import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { confirmBlockerAction } from "../actions/worklog.actions";
import type { WorklogOutput } from "../schemas/worklog.schema";
import { DELAY_LABEL, interpretationText, needsConfirmation } from "../utils/worklog";

/** Work-log note with the SYSTEM interpretation and, when it applies, the blocker question (F1 spec §3). */
export function WorklogInterpretation({
  workLogId,
  note,
  interpretation,
  confirmed,
}: {
  workLogId: string;
  note: string;
  interpretation: WorklogOutput | null;
  confirmed: boolean | null;
}) {
  const { run, pending } = useActionRunner();
  const answer = (value: boolean) => run(() => confirmBlockerAction({ workLogId, confirmed: value }));
  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className="line-clamp-2 text-muted-foreground">{note}</p>
      {interpretation && (
        <>
          <p>
            <span className="font-mono tracking-wider text-muted-foreground">SYSTEM 해석</span> · {interpretationText(interpretation)}
          </p>
          {needsConfirmation(interpretation) &&
            (confirmed === null ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{DELAY_LABEL[interpretation.delayReason]}로 늦어진 것 같아요. 외부 방해로 표시할까요?</span>
                <Button size="xs" variant="outline" disabled={pending} onClick={() => answer(true)}>
                  표시
                </Button>
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => answer(false)}>
                  아니요
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5">
                {confirmed ? "외부 방해로 표시됨" : "외부 방해로 표시 안 함"}
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => answer(!confirmed)}>
                  {confirmed ? "취소" : "변경"}
                </Button>
              </p>
            ))}
        </>
      )}
    </div>
  );
}
