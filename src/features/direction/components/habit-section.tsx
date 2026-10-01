"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { createHabitAction, updateHabitAction } from "../actions/direction.actions";
import { formatWeekdays, WEEKDAY_LABEL } from "../domain/habits";
import type { HabitRule, MissionOption } from "../domain/direction.types";
import type { HabitListItem } from "../queries/habit.queries";
import { nativeSelectClass } from "@/components/ui/native-select";

const selectClass = nativeSelectClass;
const DAYS = [1, 2, 3, 4, 5, 6, 7];

const ruleText = (h: HabitListItem) => (h.rule === "focus" ? `집중 ${h.target_minutes}분` : "체크");

/** Habits = execution rules that repeat a protocol (ADR 0021). Listed, archived and created here. */
export function HabitSection({ habits, options }: { habits: HabitListItem[]; options: MissionOption[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const [rule, setRule] = useState<HabitRule>("check");
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
    <section aria-label={terms.habits} className="space-y-2">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.habits}</h2>
      {active.length > 0 && (
        <ul aria-label={`${terms.habit} 목록`} className="divide-y divide-border rounded-md border border-border">
          {active.map((h) => (
            <li key={h.id} aria-label={`${terms.habit} ${h.title}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{h.title}</span>
              <span className="text-xs text-muted-foreground">
                {formatWeekdays(h.weekdays)} · {ruleText(h)}
                {h.protocolTitle && ` · ${h.protocolTitle} › ${h.missionTitle}`}
              </span>
              <Button size="xs" variant="ghost" className="ml-auto" disabled={pending} onClick={() => setStatus(h, "archived")}>
                보관
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        aria-label={`새 ${terms.habit}`}
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const minutes = String(fd.get("targetMinutes") ?? "").trim();
          run(
            () =>
              createHabitAction({
                title: String(fd.get("title") ?? ""),
                rule,
                targetMinutes: rule === "focus" && minutes ? Number(minutes) : null,
                weekdays: fd.getAll("weekdays").map(Number),
                protocolId: String(fd.get("protocolId") ?? "") || null,
              }),
            {
              onSuccess: () => {
                form.reset();
                setRule("check");
              },
            },
          );
        }}
      >
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="habit-title" className="text-xs text-muted-foreground">이름</Label>
          <Input id="habit-title" name="title" required maxLength={80} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="habit-rule" className="text-xs text-muted-foreground">규칙</Label>
          <select id="habit-rule" name="rule" value={rule} onChange={(e) => setRule(e.target.value as HabitRule)} className={selectClass}>
            <option value="check">체크</option>
            <option value="focus">집중 시간</option>
          </select>
        </div>
        {rule === "focus" && (
          <div className="space-y-1">
            <Label htmlFor="habit-target" className="text-xs text-muted-foreground">목표 시간(분)</Label>
            <Input id="habit-target" name="targetMinutes" type="number" min={5} max={600} required className="h-8 w-20" />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="habit-protocol" className="text-xs text-muted-foreground">{terms.protocol}</Label>
          <select id="habit-protocol" name="protocolId" defaultValue="" required={rule === "focus"} className={selectClass}>
            <option value="">연결 안 함</option>
            {options
              .filter((m) => m.protocols.length > 0)
              .map((m) => (
                <optgroup key={m.id} label={m.title}>
                  {m.protocols.map((p) => (
                    <option key={p.id} value={p.id}>{`${m.title} › ${p.title}`}</option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">요일</legend>
          <div className="flex gap-1.5">
            {DAYS.map((d) => (
              <label key={d} className="flex items-center gap-0.5 text-xs">
                <input type="checkbox" name="weekdays" value={d} defaultChecked={d <= 5} aria-label={WEEKDAY_LABEL[d]} />
                {WEEKDAY_LABEL[d]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          추가
        </Button>
      </form>
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
    </section>
  );
}
