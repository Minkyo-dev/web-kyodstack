"use client";

import { cn } from "@/lib/utils";

/**
 * 1–5 rating as a native radio group: keyboard-accessible, and the number is
 * always visible, so it doesn't rely on color (spec §14.5).
 */
export function ScoreInput({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="ml-1 opacity-70">{hint}</span>}
      </legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-md border border-input text-sm tabular-nums",
              "has-checked:border-foreground has-checked:bg-accent has-checked:font-semibold",
              "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={n}
              defaultChecked={defaultValue === n}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function readScore(fd: FormData, name: string): number | null {
  const v = fd.get(name);
  return v ? Number(v) : null;
}
