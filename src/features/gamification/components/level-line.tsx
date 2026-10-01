"use client";

import Link from "next/link";
import { usePlayer } from "./progress-notifier";

/** Thin always-visible level line; renders nothing when gamification is off. */
export function LevelLine() {
  const { player, chip } = usePlayer();
  if (!player) return null;
  return (
    <div className="relative shrink-0 px-3 text-xs md:mt-3">
      <Link
        href="/scheduler/progress"
        aria-label={`Lv.${player.level} · ${player.into} / ${player.need} XP`}
        className="flex items-center gap-2 rounded-md py-1 whitespace-nowrap hover:text-foreground"
      >
        <span className="font-mono font-medium">Lv.{player.level}</span>
        <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
          <span className="block h-full bg-sidebar-primary" style={{ width: `${(player.into / player.need) * 100}%` }} />
        </span>
        <span className="hidden text-muted-foreground tabular-nums md:inline">
          {player.into} / {player.need}
        </span>
      </Link>
      {player.title && (
        <p className="hidden font-mono text-[10px] tracking-widest text-muted-foreground md:block">{player.title}</p>
      )}
      {/* Takes no width: floats just under the line for ~1.5 s. */}
      <span
        aria-live="polite"
        className="pointer-events-none absolute top-full left-3 z-10 md:right-3 md:left-auto rounded bg-background px-1 font-mono text-xs whitespace-nowrap tabular-nums empty:hidden"
      >
        {chip ? `+${chip} XP` : ""}
      </span>
    </div>
  );
}
