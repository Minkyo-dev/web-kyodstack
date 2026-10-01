"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import { deleteCriterionAction, setCriterionProgressAction, upsertCriterionAction } from "../actions/direction.actions";
import type { MissionCriterion } from "../domain/direction.types";

const selectClass = "h-8 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function CriteriaList({ missionId, criteria, closed }: { missionId: string; criteria: MissionCriterion[]; closed: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <section aria-label="성공 기준" className="space-y-2">
      <h3 className="text-sm font-semibold">
        성공 기준 <span className="text-xs font-normal text-muted-foreground">{criteria.filter((c) => c.met_at).length}/{criteria.length} 달성</span>
      </h3>
      {criteria.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {criteria.map((c) => (
            <li key={c.id} aria-label={`기준 ${c.label}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              {c.met_at ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1">
                {c.label}
                <span className="sr-only">{c.met_at ? " (달성)" : " (미달성)"}</span>
              </span>
              {c.kind === "check" ? (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    aria-label={`${c.label} 달성`}
                    checked={c.met_at !== null}
                    disabled={pending || closed}
                    onChange={(e) => run(() => setCriterionProgressAction({ criterionId: c.id, met: e.target.checked }))}
                  />
                  달성
                </label>
              ) : (
                <form
                  className="flex items-center gap-1 text-xs tabular-nums"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Number(new FormData(e.currentTarget).get("current"));
                    run(() => setCriterionProgressAction({ criterionId: c.id, currentValue: v }));
                  }}
                >
                  <Input
                    name="current"
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${c.label} 현재값`}
                    defaultValue={c.current_value ?? 0}
                    disabled={closed}
                    className="h-7 w-16"
                  />
                  / {c.target_value} {c.unit}
                  <Button type="submit" size="xs" variant="ghost" disabled={pending || closed}>갱신</Button>
                </form>
              )}
              {!closed && (
                <Button size="xs" variant="ghost" aria-label={`기준 ${c.label} 삭제`} disabled={pending} onClick={() => run(() => deleteCriterionAction({ criterionId: c.id }))}>
                  삭제
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form
          aria-label="새 기준"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const kind = String(fd.get("kind"));
            const target = String(fd.get("target") ?? "").trim();
            run(
              () =>
                upsertCriterionAction({
                  missionId,
                  label: String(fd.get("label") ?? ""),
                  kind,
                  targetValue: kind === "numeric" ? (target === "" ? null : Number(target)) : null,
                  unit: String(fd.get("unit") ?? "") || null,
                }),
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="criterion-label" className="text-xs text-muted-foreground">기준</Label>
            <Input id="criterion-label" name="label" required maxLength={120} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-kind" className="text-xs text-muted-foreground">종류</Label>
            <select id="criterion-kind" name="kind" defaultValue="check" className={selectClass}>
              <option value="check">체크</option>
              <option value="numeric">숫자</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-target" className="text-xs text-muted-foreground">목표값</Label>
            <Input id="criterion-target" name="target" type="number" min={0} step="any" className="h-8 w-20" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="criterion-unit" className="text-xs text-muted-foreground">단위</Label>
            <Input id="criterion-unit" name="unit" maxLength={12} className="h-8 w-16" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>기준 추가</Button>
        </form>
      )}
    </section>
  );
}
