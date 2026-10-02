"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionRunner } from "@/hooks/use-action-runner";
import { josa, TERMS } from "@/lib/terms";
import { createHabitAction, updateHabitAction } from "../actions/direction.actions";
import { formatWeekdays } from "../domain/habits";
import type { Protocol } from "../domain/direction.types";
import type { HabitListItem } from "../queries/habit.queries";
import { Field, WeekdayPicker, str } from "./blueprint-ui";

const ruleText = (h: HabitListItem) => (h.rule === "focus" ? `타이머 ${h.target_minutes}분이면 자동 체크` : "직접 체크");

/** Habits with their schedule and rule as text; archive / restore (ADR 0021). */
export function HabitList({ habits, showRule = false }: { habits: HabitListItem[]; showRule?: boolean }) {
  const { run, pending } = useActionRunner();
  const active = habits.filter((h) => h.status === "active");
  const archived = habits.filter((h) => h.status === "archived");
  const setStatus = (h: HabitListItem, status: "active" | "archived") =>
    run(() =>
      updateHabitAction({
        habitId: h.id,
        title: h.title,
        rule: h.rule,
        targetMinutes: h.target_minutes,
        weekdays: h.weekdays,
        protocolId: h.protocol_id,
        status,
        sortOrder: h.sort_order,
      }),
    );
  return (
    <div className="space-y-2">
      {active.length > 0 && (
        <ul aria-label={`${TERMS.habit} 목록`} className="divide-y divide-border rounded-md border border-border">
          {active.map((h) => (
            <li key={h.id} aria-label={`${TERMS.habit} ${h.title}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
              <span className="font-medium">{h.title}</span>
              <span className="text-xs text-muted-foreground">
                {formatWeekdays(h.weekdays)} · {ruleText(h)}
                {showRule && h.protocolTitle && ` · ${h.protocolTitle}`}
              </span>
              <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={() => setStatus(h, "archived")}>
                보관
              </Button>
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">보관됨 ({archived.length})</summary>
          <ul className="mt-1 flex flex-wrap gap-2">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center gap-1">
                {h.title}
                <Button size="xs" variant="ghost" disabled={pending} onClick={() => setStatus(h, "active")}>
                  복원
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Add a habit. With `protocols` it belongs to a change: pick the rule it repeats (its name and minutes prefill) and
 * optionally let the timer tick it. Without, it is a stand-alone (maintenance) habit ticked by hand.
 */
export function HabitCreateForm({ protocols, idPrefix }: { protocols?: Protocol[]; idPrefix: string }) {
  const { run, pending } = useActionRunner();
  const linked = protocols !== undefined;
  const [protocolId, setProtocolId] = useState(protocols?.[0]?.id ?? "");
  const [focus, setFocus] = useState(false);
  const protocol = protocols?.find((p) => p.id === protocolId) ?? null;
  const [titleKey, setTitleKey] = useState(0);

  if (linked && protocols.length === 0) {
    return <p className="text-sm text-muted-foreground">{`${josa(TERMS.habit, "은/는")} ${josa(TERMS.protocol, "을/를")} 반복하는 행동입니다. 위에서 ${josa(TERMS.protocol, "을/를")} 먼저 추가하세요.`}</p>;
  }

  return (
    <form
      aria-label={`새 ${TERMS.habit}`}
      className="space-y-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const minutes = str(fd, "targetMinutes");
        run(
          () =>
            createHabitAction({
              title: str(fd, "title"),
              rule: linked && focus ? "focus" : "check",
              targetMinutes: linked && focus && minutes ? Number(minutes) : null,
              weekdays: fd.getAll("weekdays").map(Number),
              protocolId: linked ? protocolId || null : null,
            }),
          {
            onSuccess: () => {
              form.reset();
              setFocus(false);
              setTitleKey((k) => k + 1);
            },
          },
        );
      }}
    >
      {linked && (
        <Field id={`${idPrefix}-protocol`} label={`어떤 ${josa(TERMS.protocol, "을/를")} 반복하나요?`}>
          <select
            id={`${idPrefix}-protocol`}
            className={`${nativeSelectClass} w-full`}
            value={protocolId}
            onChange={(e) => {
              setProtocolId(e.target.value);
              setTitleKey((k) => k + 1);
            }}
          >
            {protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id={`${idPrefix}-title`} label="이름" hint="체크할 때 보이는 짧은 이름입니다. 처음엔 2분이면 끝날 만큼 작게.">
        <Input
          key={titleKey}
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={80}
          defaultValue={protocol ? protocol.title.split(", ").at(-1) : ""}
          placeholder={linked ? "예: 쉐도잉 5문장" : "예: 물 한 잔 마시기"}
        />
      </Field>
      <WeekdayPicker idPrefix={idPrefix} />
      {linked && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
            타이머로 집중하면 자동 체크
          </label>
          {focus && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Input
                key={`${titleKey}-m`}
                name="targetMinutes"
                type="number"
                min={5}
                max={600}
                required
                aria-label="목표 시간(분)"
                defaultValue={protocol?.intended_minutes ?? ""}
                className="h-7 w-16"
              />
              분
            </label>
          )}
        </div>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {`${TERMS.habit} 추가`}
      </Button>
    </form>
  );
}
