"use client";

import { useState } from "react";
import { Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import type { SessionWithTask } from "../domain/work-session.types";
import { formatElapsed } from "../utils/metrics";
import { StopSessionDialog } from "./stop-session-dialog";

/** Header timer (spec §11). Elapsed is display-only; the server stores the instants. */
export function WorkSessionTimer({
  session,
  timezone,
}: {
  session: SessionWithTask | null;
  timezone: string;
}) {
  const now = useNow(1000, session !== null);
  const [stopping, setStopping] = useState(false);
  if (!session) return null;

  const elapsed = now.getTime() - new Date(session.started_at).getTime();

  return (
    <div
      role="status"
      aria-label="실행 중인 타이머"
      className="flex items-center gap-2 rounded-md border border-planned/50 bg-planned/10 py-1 pr-1 pl-2.5 text-sm"
    >
      <Timer className="size-4 text-planned" aria-hidden />
      <span className="max-w-48 truncate font-medium">{session.task.title}</span>
      <span className="font-mono tabular-nums" aria-live="off">
        {formatElapsed(elapsed)}
      </span>
      <Button size="sm" variant="outline" onClick={() => setStopping(true)}>
        <Square aria-hidden className="fill-current" />
        정지
      </Button>
      <StopSessionDialog
        session={stopping ? session : null}
        timezone={timezone}
        onClose={() => setStopping(false)}
      />
    </div>
  );
}
