"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { TASK_TYPE_LABEL } from "@/features/classification/domain/classification.types";
import {
  applyProposalsAction,
  ignoreProposalsAction,
  requestClassificationAction,
} from "../actions/classification.actions";
import { proposalView, type Proposal, type ProposalView } from "../utils/classify";

/** "SYSTEM 제안" chip row (F1 spec §2). Nothing changes until [적용] or a saved [수정]. */
export function ClassificationProposal({
  taskId,
  proposals,
  domainNames,
  onEdit,
}: {
  taskId: string;
  proposals: Proposal[];
  domainNames: Record<string, string>;
  onEdit: (view: ProposalView) => void;
}) {
  const { run, pending } = useActionRunner();
  if (proposals.length === 0) {
    return (
      <Button
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(() => requestClassificationAction({ taskId }), {
            onSuccess: (n) => {
              toast(n === 0 ? "제안할 내용이 없습니다." : "분류 제안을 받았습니다.");
            },
          })
        }
      >
        <Sparkles aria-hidden />
        분류 제안 받기
      </Button>
    );
  }
  const v = proposalView(proposals, domainNames);
  const parts = [
    v.taskType && `유형 ${TASK_TYPE_LABEL[v.taskType]}`,
    v.domainName && `영역 ${v.domainName}`,
    v.complexity && `복잡도 ${v.complexity}`,
    v.skills.length > 0 && v.skills.map((s) => `#${s}`).join(" "),
    v.confidence !== null && `신뢰도 ${Math.round(v.confidence * 100)}%`,
  ].filter(Boolean);
  return (
    <section aria-label="SYSTEM 제안" className="space-y-1.5 rounded-md border border-border px-3 py-2 text-xs">
      <p className="font-mono tracking-wider text-muted-foreground">SYSTEM 제안</p>
      <p className="tabular-nums">{parts.join(" · ")}</p>
      <div className="flex gap-1.5">
        <Button size="xs" disabled={pending} onClick={() => run(() => applyProposalsAction({ taskId }), { success: "제안을 적용했습니다." })}>
          적용
        </Button>
        <Button size="xs" variant="outline" disabled={pending} onClick={() => onEdit(v)}>
          수정
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => ignoreProposalsAction({ taskId }))}>
          무시
        </Button>
      </div>
    </section>
  );
}

