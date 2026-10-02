"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { josa, TERMS } from "@/lib/terms";
import { cn } from "@/lib/utils";
import { createChangePlanAction } from "../actions/direction.actions";
import { WEEKDAY_LABEL } from "../domain/habits";
import { composeRule, RULE_LIMITS } from "../domain/rule-sentence";
import { Example, Field } from "./blueprint-ui";

type CriterionDraft = { label: string; numeric: boolean; target: string; unit: string };
const STEPS = [
  { title: `어떤 ${josa(TERMS.mission, "을/를")} 원하나요?`, short: TERMS.mission },
  { title: "어떻게 확인할까요?", short: TERMS.criteria },
  { title: "어떤 과정을 반복할까요?", short: TERMS.path },
  { title: "언제, 어디서, 무엇을 할까요?", short: TERMS.protocol },
] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const emptyCriterion = (): CriterionDraft => ({ label: "", numeric: false, target: "", unit: "" });

/** "+ 새 변화": four guided steps, everything after the first optional (ADR 0038 §3). */
export function ChangeWizard({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [change, setChange] = useState({ title: "", outcome: "", deadline: null as string | null, identityIds: [] as string[] });
  const [criteria, setCriteria] = useState<CriterionDraft[]>([emptyCriterion()]);
  const [path, setPath] = useState({ title: "", approach: "", tradeOffs: "" });
  const [rule, setRule] = useState({ cue: "", place: "", action: "", minutes: "" });
  const [habit, setHabit] = useState({ on: true, focus: false, weekdays: [1, 2, 3, 4, 5] });

  const reset = () => {
    setStep(0);
    setChange({ title: "", outcome: "", deadline: null, identityIds: [] });
    setCriteria([emptyCriterion()]);
    setPath({ title: "", approach: "", tradeOffs: "" });
    setRule({ cue: "", place: "", action: "", minutes: "" });
    setHabit({ on: true, focus: false, weekdays: [1, 2, 3, 4, 5] });
  };

  const hasPath = path.title.trim() !== "" && path.approach.trim() !== "";
  const hasRule = hasPath && rule.cue.trim() !== "" && rule.action.trim() !== "";
  const sentence = composeRule(rule);
  const minutes = rule.minutes ? Number(rule.minutes) : null;

  const submit = () =>
    run(
      () =>
        createChangePlanAction({
          change: { title: change.title, outcome: change.outcome || null, deadline: change.deadline, identityIds: change.identityIds },
          criteria: criteria
            .filter((c) => c.label.trim())
            .map((c) => ({ label: c.label, kind: c.numeric ? "numeric" : "check", targetValue: c.numeric ? Number(c.target) : null, unit: c.numeric ? c.unit || null : null })),
          path: hasPath ? { title: path.title, approach: path.approach, tradeOffs: path.tradeOffs || null } : null,
          rule: hasRule ? { title: sentence, steps: [], intendedMinutes: minutes } : null,
          habit:
            hasRule && habit.on
              ? {
                  title: rule.action.trim().slice(0, 80),
                  rule: habit.focus && minutes ? "focus" : "check",
                  targetMinutes: habit.focus && minutes ? minutes : null,
                  weekdays: habit.weekdays,
                }
              : null,
        }),
      {
        success: `${josa(TERMS.mission, "을/를")} 만들었습니다.`,
        onSuccess: (m) => {
          setOpen(false);
          reset();
          router.push(`/scheduler/directive?mission=${m.id}#mission-detail`);
        },
      },
    );

  const canNext = step === 0 ? change.title.trim() !== "" : true;
  const last = step === STEPS.length - 1;

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {`새 ${TERMS.mission}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{`새 ${TERMS.mission} 설계`}</DialogTitle>
            <DialogDescription>{`프로젝트는 끝나는 일, ${josa(TERMS.mission, "은/는")} 계속 반복해 내가 되는 일입니다. 첫 단계만 필수이고 나머지는 나중에 채워도 됩니다.`}</DialogDescription>
          </DialogHeader>

          <ol aria-label="설계 단계" className="grid grid-cols-4 gap-1 text-[11px]">
            {STEPS.map((s, i) => (
              <li
                key={s.short}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "border-t-2 pt-1",
                  i === step ? "border-foreground font-semibold text-foreground" : i < step ? "border-foreground/50 text-muted-foreground" : "border-border text-muted-foreground",
                )}
              >
                {i + 1}. {s.short}
              </li>
            ))}
          </ol>

          <form
            aria-label={STEPS[step].title}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (last) submit();
              else if (canNext) setStep(step + 1);
            }}
          >
            <h3 className="text-base font-semibold">{STEPS[step].title}</h3>

            {step === 0 && (
              <>
                <Field id="wiz-title" label={`${TERMS.mission} 이름`} hint="결과물이 아니라 '반복해서 하게 될 나'를 적습니다.">
                  <Input
                    id="wiz-title"
                    required
                    maxLength={120}
                    value={change.title}
                    onChange={(e) => setChange({ ...change, title: e.target.value })}
                    placeholder="예: 영어로 회의를 진행하는 사람이 된다"
                  />
                </Field>
                <Field id="wiz-outcome" label="왜 이 변화를 원하나요? (선택)">
                  <Textarea id="wiz-outcome" rows={2} maxLength={500} value={change.outcome} onChange={(e) => setChange({ ...change, outcome: e.target.value })} />
                </Field>
                {roles.length > 0 ? (
                  <fieldset className="space-y-1">
                    <legend className="text-xs text-muted-foreground">{`어떤 ${josa(TERMS.identity, "을/를")} 위한 ${TERMS.mission}인가요?`}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {roles.map((r) => {
                        const on = change.identityIds.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setChange({ ...change, identityIds: on ? change.identityIds.filter((x) => x !== r.id) : [...change.identityIds, r.id].slice(0, 6) })
                            }
                            className={cn("rounded-md border px-2 py-1 text-sm", on ? "border-foreground bg-foreground text-background" : "border-border")}
                          >
                            {on ? "✓ " : ""}
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <p className="text-xs text-muted-foreground">{`${josa(TERMS.identity, "을/를")} 먼저 추가하면 여기서 연결할 수 있습니다.`}</p>
                )}
                <Field id="wiz-deadline" label="기한 (선택)">
                  <DatePicker id="wiz-deadline" clearable value={change.deadline} onChange={(v) => setChange({ ...change, deadline: v })} />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <p className="text-sm text-muted-foreground">
                  {`${josa(TERMS.mission, "이/가")} 일어났다고 말할 수 있는 신호를 적습니다. 진행률은 이 기준으로 계산됩니다.`} <Example>영어 회의 3번 진행 (숫자), 발표 녹화 공개 (체크)</Example>
                </p>
                <ul className="space-y-2">
                  {criteria.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-end gap-2">
                      <Field id={`wiz-crit-${i}`} label={`기준 ${i + 1}`} className="min-w-40 flex-1">
                        <Input id={`wiz-crit-${i}`} maxLength={120} value={c.label} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      </Field>
                      <Field id={`wiz-crit-kind-${i}`} label="형태">
                        <select
                          id={`wiz-crit-kind-${i}`}
                          className={nativeSelectClass}
                          value={c.numeric ? "numeric" : "check"}
                          onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, numeric: e.target.value === "numeric" } : x)))}
                        >
                          <option value="check">체크</option>
                          <option value="numeric">숫자</option>
                        </select>
                      </Field>
                      {c.numeric && (
                        <>
                          <Field id={`wiz-crit-target-${i}`} label="목표값">
                            <Input
                              id={`wiz-crit-target-${i}`}
                              type="number"
                              min={0}
                              step="any"
                              required={c.label.trim() !== ""}
                              value={c.target}
                              onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                              className="w-20"
                            />
                          </Field>
                          <Field id={`wiz-crit-unit-${i}`} label="단위">
                            <Input id={`wiz-crit-unit-${i}`} maxLength={12} value={c.unit} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} className="w-16" />
                          </Field>
                        </>
                      )}
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`기준 ${i + 1} 지우기`} onClick={() => setCriteria(criteria.length > 1 ? criteria.filter((_, j) => j !== i) : [emptyCriterion()])}>
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                {criteria.length < 8 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setCriteria([...criteria, emptyCriterion()])}>
                    <Plus aria-hidden />
                    기준 추가
                  </Button>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-sm text-muted-foreground">결과는 반복되는 과정에서 나옵니다. 매주 반복할 방식과, 그 대신 하지 않을 것을 정합니다.</p>
                <Field id="wiz-path-title" label={`${TERMS.path} 이름`}>
                  <Input id="wiz-path-title" maxLength={80} value={path.title} onChange={(e) => setPath({ ...path, title: e.target.value })} placeholder="예: 출력 먼저" />
                </Field>
                <Field id="wiz-path-approach" label="어떻게 반복하나요?" hint={path.title.trim() && !path.approach.trim() ? "이름과 함께 적어야 저장됩니다." : undefined}>
                  <Textarea
                    id="wiz-path-approach"
                    rows={3}
                    maxLength={1000}
                    value={path.approach}
                    onChange={(e) => setPath({ ...path, approach: e.target.value })}
                    placeholder="예: 매일 짧게 말하기를 먼저 하고, 문법 공부는 주말에만 한다"
                  />
                </Field>
                <Field id="wiz-path-tradeoffs" label="포기하는 것 (선택)">
                  <Textarea id="wiz-path-tradeoffs" rows={2} maxLength={1000} value={path.tradeOffs} onChange={(e) => setPath({ ...path, tradeOffs: e.target.value })} placeholder="예: 새 교재 사기, 단어장 만들기" />
                </Field>
              </>
            )}

            {step === 3 &&
              (hasPath ? (
                <>
                  <p className="text-sm text-muted-foreground">시간과 장소를 미리 정하면 ‘언제 하지?’ 고민이 사라집니다. 처음엔 2분이면 끝날 만큼 작게.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field id="wiz-cue" label="언제 (신호)">
                      <Input id="wiz-cue" maxLength={RULE_LIMITS.cue} value={rule.cue} onChange={(e) => setRule({ ...rule, cue: e.target.value })} placeholder="예: 출근 후 커피를 내리면" />
                    </Field>
                    <Field id="wiz-place" label="어디서 (선택)">
                      <Input id="wiz-place" maxLength={RULE_LIMITS.place} value={rule.place} onChange={(e) => setRule({ ...rule, place: e.target.value })} placeholder="예: 책상" />
                    </Field>
                    <Field id="wiz-action" label="무엇을">
                      <Input id="wiz-action" maxLength={RULE_LIMITS.action} value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value })} placeholder="예: 25분 쉐도잉" />
                    </Field>
                    <Field id="wiz-minutes" label="몇 분 (선택)">
                      <Input id="wiz-minutes" type="number" min={5} max={600} value={rule.minutes} onChange={(e) => setRule({ ...rule, minutes: e.target.value })} className="w-24" />
                    </Field>
                  </div>
                  <p aria-live="polite" className="rounded-md border border-dashed border-border px-3 py-2 text-sm">
                    {sentence ? `“${sentence}”` : <span className="text-muted-foreground">언제와 무엇을 적으면 문장이 만들어집니다.</span>}
                  </p>
                  {hasRule && (
                    <fieldset className="space-y-2 rounded-md border border-border p-3">
                      <legend className="px-1 text-xs text-muted-foreground">{TERMS.habit}</legend>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={habit.on} onChange={(e) => setHabit({ ...habit, on: e.target.checked })} />
                        {`이 규칙을 매일 체크할 ${josa(TERMS.habit, "으로/로")} 만들기`}
                      </label>
                      {habit.on && (
                        <>
                          <div className="flex flex-wrap gap-1" role="group" aria-label="요일">
                            {DAYS.map((d) => {
                              const on = habit.weekdays.includes(d);
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  aria-pressed={on}
                                  aria-label={WEEKDAY_LABEL[d]}
                                  onClick={() => setHabit({ ...habit, weekdays: on ? habit.weekdays.filter((x) => x !== d) : [...habit.weekdays, d] })}
                                  className={cn("size-8 rounded-md border text-xs", on ? "border-foreground bg-foreground text-background" : "border-border")}
                                >
                                  {WEEKDAY_LABEL[d]}
                                </button>
                              );
                            })}
                          </div>
                          {minutes && (
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={habit.focus} onChange={(e) => setHabit({ ...habit, focus: e.target.checked })} />
                              {`타이머로 ${minutes}분 집중하면 자동 체크`}
                            </label>
                          )}
                          {habit.weekdays.length === 0 && <p className="text-xs">요일을 하나 이상 고르세요.</p>}
                        </>
                      )}
                    </fieldset>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{`${josa(TERMS.protocol, "은/는")} ${TERMS.path} 아래에 만듭니다. 이전 단계에서 ${josa(TERMS.path, "을/를")} 정하거나, 지금은 건너뛰고 나중에 추가하세요.`}</p>
              ))}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
                이전
              </Button>
              <div className="flex gap-2">
                {step > 0 && !last && (
                  <Button type="button" variant="outline" disabled={pending} onClick={submit}>
                    여기까지 만들기
                  </Button>
                )}
                <Button type="submit" disabled={pending || !canNext || (last && hasRule && habit.on && habit.weekdays.length === 0)}>
                  {last ? "만들기" : "다음"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
