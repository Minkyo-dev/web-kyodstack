"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Diagnosis } from "../domain/diagnosis";
import { DIAGNOSIS_TEXT } from "../domain/status-text";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

/**
 * SYSTEM QUESTION for a mission's suspected layer (G4, ADR 0023). Choices only navigate; [유지] hides the question in
 * this browser until next week. Nothing is written to the database.
 */
export function DiagnosisQuestion({ missionId, diagnosis, weekStart }: { missionId: string; diagnosis: Diagnosis; weekStart: string }) {
  const layer = diagnosis.suspected;
  const key = `kyod.diagnosis.keep.${missionId}.${layer}.${weekStart}`;
  const kept = useSyncExternalStore(subscribe, () => read(key), () => false);

  if (diagnosis.collecting) {
    return <p className="text-xs text-muted-foreground">{DIAGNOSIS_TEXT.collecting(diagnosis.collecting.n, diagnosis.collecting.need)}</p>;
  }
  if (!layer || kept) return null;
  const evidence = diagnosis.signals.find((s) => s.layer === layer)!.evidence;
  const choice = DIAGNOSIS_TEXT.choice[layer];
  const href = choice.target === "mission" ? `/scheduler/directive?mission=${missionId}#mission-detail` : "/scheduler";
  const keep = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: the question simply stays.
    }
    listeners.forEach((l) => l());
  };

  return (
    <div aria-label="SYSTEM QUESTION" role="group" className="space-y-1.5 border-t border-border pt-2 text-xs">
      <p className="font-mono tracking-wider text-muted-foreground">SYSTEM QUESTION</p>
      <p>{DIAGNOSIS_TEXT.observation(layer, evidence)}</p>
      <p className="font-medium">{DIAGNOSIS_TEXT.question[layer]}</p>
      <div className="flex gap-2">
        <Link href={href} className={buttonVariants({ variant: "outline", size: "xs" })}>
          {choice.label}
        </Link>
        <Button size="xs" variant="ghost" onClick={keep}>
          {DIAGNOSIS_TEXT.keep}
        </Button>
      </div>
    </div>
  );
}
