"use client";

import { readScore, ScoreInput } from "./score-input";

/** Focus, then optional mood and energy (spec §24). */
export function SessionScoreFields({
  defaults,
}: {
  defaults?: { focus?: number | null; mood?: number | null; energy?: number | null };
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <ScoreInput name="focusScore" label="집중" defaultValue={defaults?.focus} />
      <ScoreInput name="moodScore" label="기분" hint="선택" defaultValue={defaults?.mood} />
      <ScoreInput name="energyScore" label="에너지" hint="선택" defaultValue={defaults?.energy} />
    </div>
  );
}

export function readScoreFields(fd: FormData) {
  return {
    focusScore: readScore(fd, "focusScore"),
    moodScore: readScore(fd, "moodScore"),
    energyScore: readScore(fd, "energyScore"),
    note: String(fd.get("note") ?? "").trim() || null,
  };
}
