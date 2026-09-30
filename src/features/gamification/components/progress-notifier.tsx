"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ProgressSinkContext } from "@/hooks/progress-sink";
import type { ProgressDelta } from "@/lib/progress";
import { mergeLevelUp } from "../utils/level";
import { LevelUpEvent } from "./level-up-event";

export type PlayerView = { level: number; into: number; need: number; total: number; animations: boolean };

const PlayerContext = createContext<{ player: PlayerView | null; chip: number | null }>({ player: null, chip: null });
export const usePlayer = () => useContext(PlayerContext);

/** Queues E1 notifications: tiny +XP chip, rare level-up event (E1 spec §4). */
export function ProgressNotifier({ player, children }: { player: PlayerView | null; children: React.ReactNode }) {
  const [chip, setChip] = useState<{ at: number; xp: number } | null>(null);
  const [event, setEvent] = useState<{ from: number; to: number } | null>(null);

  const push = useCallback((d: ProgressDelta) => {
    const xp = d.xp.reduce((s, x) => s + x.xp, 0);
    if (xp > 0) {
      setChip((c) => {
        const now = Date.now();
        return { at: now, xp: (c && now - c.at < 500 ? c.xp : 0) + xp };
      });
    }
    if (d.levelUp) setEvent((e) => mergeLevelUp(e, d.levelUp));
  }, []);

  useEffect(() => {
    if (!chip) return;
    const t = setTimeout(() => setChip(null), 1500);
    return () => clearTimeout(t);
  }, [chip]);

  return (
    <ProgressSinkContext.Provider value={player ? push : () => {}}>
      <PlayerContext.Provider value={{ player, chip: chip?.xp ?? null }}>
        {children}
        {player && event && (
          <LevelUpEvent from={event.from} to={event.to} animate={player.animations} onClose={() => setEvent(null)} />
        )}
      </PlayerContext.Provider>
    </ProgressSinkContext.Provider>
  );
}
