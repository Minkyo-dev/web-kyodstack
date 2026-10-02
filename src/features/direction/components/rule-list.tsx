"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { josa, TERMS } from "@/lib/terms";
import { createProtocolAction, updateProtocolAction } from "../actions/direction.actions";
import type { Protocol } from "../domain/direction.types";
import type { StepState } from "../domain/plan";
import { composeRule, RULE_LIMITS } from "../domain/rule-sentence";
import type { HabitListItem } from "../queries/habit.queries";
import { Field, StepShell, str } from "./blueprint-ui";

const minutesOf = (fd: FormData) => {
  const m = str(fd, "minutes");
  return m ? Number(m) : null;
};

/** Blueprint step 4: 실행 규칙 as "언제, 어디서 무엇을" sentences (ADR 0038 §4). Needs an active process. */
export function RuleList({
  pathId,
  protocols,
  habits,
  closed,
  n,
  state,
}: {
  pathId: string | null;
  protocols: Protocol[];
  habits: HabitListItem[];
  closed: boolean;
  n: number;
  state: StepState;
}) {
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState<string | null>(null);
  const [parts, setParts] = useState({ cue: "", place: "", action: "" });
  const sentence = composeRule(parts);

  const save = (p: Protocol, patch: Partial<{ title: string; intendedMinutes: number | null; status: "active" | "archived" }>, onSuccess?: () => void) =>
    run(
      () =>
        updateProtocolAction({
          protocolId: p.id,
          title: patch.title ?? p.title,
          steps: p.steps,
          intendedMinutes: patch.intendedMinutes !== undefined ? patch.intendedMinutes : p.intended_minutes,
          status: patch.status ?? "active",
          sortOrder: p.sort_order,
        }),
      { onSuccess },
    );

  return (
    <StepShell
      n={n}
      title={TERMS.protocol}
      question="언제, 어디서, 무엇을 할까요? 시간과 장소를 미리 정하면 '언제 하지?' 고민이 사라집니다."
      state={state}
    >
      {!pathId ? (
        <p className="text-sm text-muted-foreground">{`${josa(TERMS.protocol, "은/는")} ${TERMS.path} 아래에 만듭니다. 위에서 ${josa(TERMS.path, "을/를")} 먼저 정하세요.`}</p>
      ) : (
        <>
          {protocols.length > 0 && (
            <ul className="space-y-2">
              {protocols.map((p) => {
                const linked = habits.filter((h) => h.protocol_id === p.id && h.status === "active");
                return (
                  <li key={p.id} aria-label={`${TERMS.protocol} ${p.title}`} className="rounded-md border border-border px-3 py-2 text-sm">
                    {editing === p.id ? (
                      <form
                        aria-label={`${TERMS.protocol} 편집`}
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          save(p, { title: str(fd, "title"), intendedMinutes: minutesOf(fd) }, () => setEditing(null));
                        }}
                      >
                        <Field id={`rule-edit-${p.id}`} label="문장" className="min-w-56 flex-1">
                          <Input id={`rule-edit-${p.id}`} name="title" required maxLength={80} defaultValue={p.title} />
                        </Field>
                        <Field id={`rule-edit-min-${p.id}`} label="분">
                          <Input id={`rule-edit-min-${p.id}`} name="minutes" type="number" min={5} max={600} defaultValue={p.intended_minutes ?? ""} className="w-20" />
                        </Field>
                        <Button type="submit" size="sm" disabled={pending}>
                          저장
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          취소
                        </Button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">“{p.title}”</span>
                        {p.intended_minutes && <span className="text-xs text-muted-foreground tabular-nums">{p.intended_minutes}분</span>}
                        {!closed && (
                          <>
                            <Button size="icon-xs" variant="ghost" aria-label={`${p.title} 편집`} onClick={() => setEditing(p.id)}>
                              <Pencil aria-hidden />
                            </Button>
                            <Button size="xs" variant="ghost" disabled={pending} onClick={() => save(p, { status: "archived" })}>
                              보관
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {linked.length > 0 ? `${TERMS.habit}: ${linked.map((h) => h.title).join(", ")}` : `아직 연결된 ${josa(TERMS.habit, "이/가")} 없습니다.`}
                    </p>
                    {p.steps.length > 0 && (
                      <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">
                        {p.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!closed && (
            <form
              aria-label={`새 ${TERMS.protocol}`}
              className="space-y-2 rounded-md border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                run(() => createProtocolAction({ pathId, title: sentence, steps: [], intendedMinutes: minutesOf(new FormData(form)) }), {
                  onSuccess: () => {
                    form.reset();
                    setParts({ cue: "", place: "", action: "" });
                  },
                });
              }}
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_5rem]">
                <Field id="rule-cue" label="언제 (신호)">
                  <Input id="rule-cue" required maxLength={RULE_LIMITS.cue} value={parts.cue} onChange={(e) => setParts({ ...parts, cue: e.target.value })} placeholder="예: 출근 후 커피를 내리면" />
                </Field>
                <Field id="rule-place" label="어디서">
                  <Input id="rule-place" maxLength={RULE_LIMITS.place} value={parts.place} onChange={(e) => setParts({ ...parts, place: e.target.value })} placeholder="예: 책상" />
                </Field>
                <Field id="rule-action" label="무엇을">
                  <Input id="rule-action" required maxLength={RULE_LIMITS.action} value={parts.action} onChange={(e) => setParts({ ...parts, action: e.target.value })} placeholder="예: 25분 쉐도잉" />
                </Field>
                <Field id="rule-minutes" label="분 (선택)">
                  <Input id="rule-minutes" name="minutes" type="number" min={5} max={600} />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p aria-live="polite" className="min-w-0 flex-1 text-sm">
                  {sentence ? `“${sentence}”` : <span className="text-muted-foreground">언제와 무엇을 적으면 문장이 만들어집니다.</span>}
                </p>
                <Button type="submit" size="sm" variant="outline" disabled={pending || !sentence}>
                  규칙 추가
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </StepShell>
  );
}
