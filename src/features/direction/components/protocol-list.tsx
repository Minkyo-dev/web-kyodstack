"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { createProtocolAction, updateProtocolAction } from "../actions/direction.actions";
import type { Protocol } from "../domain/direction.types";
import type { HabitListItem } from "../queries/habit.queries";

export function ProtocolList({
  pathId,
  protocols,
  closed,
  habits,
}: {
  pathId: string;
  protocols: Protocol[];
  closed: boolean;
  habits: HabitListItem[];
}) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  return (
    <section aria-label={terms.protocol} className="space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.protocol}</h3>
      {protocols.length > 0 && (
        <ul className="space-y-2">
          {protocols.map((p) => (
            <li key={p.id} aria-label={`${terms.protocol} ${p.title}`} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {p.intended_minutes && <span>{p.intended_minutes}분</span>}
                  {!closed && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          updateProtocolAction({
                            protocolId: p.id,
                            title: p.title,
                            steps: p.steps,
                            intendedMinutes: p.intended_minutes,
                            status: "archived",
                            sortOrder: p.sort_order,
                          }),
                        )
                      }
                    >
                      보관
                    </Button>
                  )}
                </span>
              </div>
              {habits.some((h) => h.protocol_id === p.id && h.status === "active") && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${terms.habit}: `}
                  {habits
                    .filter((h) => h.protocol_id === p.id && h.status === "active")
                    .map((h) => h.title)
                    .join(", ")}
                </p>
              )}
              {p.steps.length > 0 && (
                <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">
                  {p.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form
          aria-label={`새 ${terms.protocol}`}
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const minutes = String(fd.get("minutes") ?? "").trim();
            run(
              () =>
                createProtocolAction({
                  pathId,
                  title: String(fd.get("title") ?? ""),
                  steps: String(fd.get("steps") ?? "").split("\n"),
                  intendedMinutes: minutes ? Number(minutes) : null,
                }),
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="protocol-title" className="text-xs text-muted-foreground">이름</Label>
              <Input id="protocol-title" name="title" required maxLength={80} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="protocol-minutes" className="text-xs text-muted-foreground">의도 시간(분)</Label>
              <Input id="protocol-minutes" name="minutes" type="number" min={5} max={600} className="h-8 w-24" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="protocol-steps" className="text-xs text-muted-foreground">단계 (한 줄에 하나)</Label>
            <Textarea id="protocol-steps" name="steps" rows={3} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>추가</Button>
        </form>
      )}
    </section>
  );
}
