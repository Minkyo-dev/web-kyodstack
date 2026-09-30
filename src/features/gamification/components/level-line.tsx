"use client";

import Link from "next/link";
import { usePlayer } from "./progress-notifier";

/** Thin always-visible level line; renders nothing when gamification is off. */
export function LevelLine() {
  const { player, chip } = usePlayer();
  if (!player) return null;
  return (
    <div className="flex items-center gap-2 px-3 text-xs md:mt-3">
      <Link
        href="/scheduler/progress"
        aria-label={`Lv.${player.level} · ${player.into} / ${player.need} XP`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 hover:text-foreground"
      >
        <span className="font-mono font-medium">Lv.{player.level}</span>
        <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
          <span className="block h-full bg-foreground/70" style={{ width: `${(player.into / player.need) * 100}%` }} />
        </span>
        <span className="hidden text-muted-foreground tabular-nums md:inline">
          {player.into} / {player.need}
        </span>
      </Link>
      <span aria-live="polite" className="font-mono text-xs tabular-nums">
        {chip ? `+${chip} XP` : ""}
      </span>
    </div>
  );
}
