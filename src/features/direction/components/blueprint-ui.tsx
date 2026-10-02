import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { STEP_STATE_LABEL, type StepState } from "../domain/plan";
import { WEEKDAY_LABEL } from "../domain/habits";

/** Building blocks of the 습관 tab (ADR 0038): numbered steps with a text status, guiding prompts, labelled fields. */

const STATE_ICON = { done: CheckCircle2, next: CircleDot, empty: Circle } as const;

export function StepShell({
  n,
  title,
  question,
  state,
  children,
  action,
}: {
  n: number;
  title: string;
  question: string;
  state: StepState;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = STATE_ICON[state];
  return (
    <section aria-label={title} className={cn("relative grid grid-cols-[1.75rem_1fr] gap-x-3", state === "next" && "rounded-lg")}>
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "grid size-7 place-items-center rounded-full border text-xs font-semibold tabular-nums",
            state === "done" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
            state === "next" && "border-foreground text-foreground",
          )}
        >
          {n}
        </span>
        <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 space-y-3 pb-7">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px]",
              state === "next" ? "border-foreground text-foreground" : "border-border text-muted-foreground",
            )}
          >
            <Icon className="size-3" aria-hidden />
            {STEP_STATE_LABEL[state]}
          </span>
          {action && <span className="ml-auto">{action}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{question}</p>
        {children}
      </div>
    </section>
  );
}

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Weekday toggles posted as `weekdays`; each day is a labelled checkbox styled as a chip. */
export function WeekdayPicker({ name = "weekdays", defaultDays = [1, 2, 3, 4, 5], idPrefix }: { name?: string; defaultDays?: number[]; idPrefix: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">요일</legend>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d) => (
          <label
            key={d}
            htmlFor={`${idPrefix}-day-${d}`}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-border text-xs has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
          >
            <input id={`${idPrefix}-day-${d}`} type="checkbox" name={name} value={d} defaultChecked={defaultDays.includes(d)} className="sr-only" aria-label={WEEKDAY_LABEL[d]} />
            {WEEKDAY_LABEL[d]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Toggle chips for picking roles (posted as `identityIds`). */
export function RolePicker({ roles, selected, idPrefix }: { roles: { id: string; name: string }[]; selected: string[]; idPrefix: string }) {
  if (roles.length === 0) return <p className="text-xs text-muted-foreground">위에서 역할을 먼저 추가하면 여기서 고를 수 있습니다.</p>;
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">어떤 역할을 위한 변화인가요? (최대 6개)</legend>
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => (
          <label
            key={r.id}
            htmlFor={`${idPrefix}-role-${r.id}`}
            className="cursor-pointer rounded-md border border-border px-2 py-1 text-sm has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
          >
            <input id={`${idPrefix}-role-${r.id}`} type="checkbox" name="identityIds" value={r.id} defaultChecked={selected.includes(r.id)} className="sr-only" />
            {r.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Example({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground/80">예: {children}</span>;
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
