"use client";

import { useState, useSyncExternalStore } from "react";
import { Gauge } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rescheduleBlockAction } from "../actions/schedule.actions";
import type { CalendarBlock } from "../domain/schedule.types";
import { sameTimeTomorrow } from "../utils/block-state";
import { formatMinutes, minutesBetween } from "../utils/duration";
import { addLocalDays, localDayRange, toLocalTime } from "../utils/timezone";
import { dayPlannedMinutes, overflowSelection, overloadFor, type OverflowCandidate } from "../utils/today";

const KEY = (date: string) => `kyod.capacity.dismissed.${date}`;
const listeners = new Set<() => void>();
function readDismissed(): string {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("kyod.capacity.dismissed."))
      .join("|");
  } catch {
    return "";
  }
}

/**
 * Calm notice when today/tomorrow is planned well beyond recent capacity (D3 spec §3).
 * Adjusting pre-selects overflow blocks; nothing moves until the user confirms.
 */
export function CapacityNotice({
  capacity,
  nearBlocks,
  today,
  timezone,
}: {
  capacity: number | null;
  nearBlocks: CalendarBlock[];
  today: string;
  timezone: string;
}) {
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readDismissed,
    () => "all", // server: render nothing until the client knows
  );
  const [adjusting, setAdjusting] = useState<string | null>(null);
  if (capacity === null || dismissed === "all") return null;

  const days = [
    { date: today, label: "오늘" },
    { date: addLocalDays(today, 1, timezone), label: "내일" },
  ].map((d) => {
    const range = localDayRange(d.date, timezone);
    return { ...d, range, planned: dayPlannedMinutes(nearBlocks, range) };
  });
  const day = days.find((d) => overloadFor(d.planned, capacity) && !dismissed.split("|").includes(KEY(d.date)));
  if (!day) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY(day.date), "1");
    } catch {
      // Blocked storage: the notice just comes back next time.
    }
    listeners.forEach((l) => l());
  };

  return (
    <>
      <div role="note" className="mx-3 mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <Gauge className="size-3.5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          {day.label} 계획 {formatMinutes(day.planned)}은 최근 근무일 보통 작업량 {formatMinutes(capacity)}보다{" "}
          {formatMinutes(day.planned - capacity)} 많아요.
        </p>
        <Button size="xs" variant="outline" onClick={() => setAdjusting(day.date)}>
          계획 조정
        </Button>
        <Button size="xs" variant="ghost" onClick={dismiss}>
          그대로 두기
        </Button>
      </div>
      {adjusting && (
        <AdjustDialog
          key={adjusting}
          blocks={nearBlocks.filter(
            (b) => b.status === "planned" && b.starts_at >= day.range.start && b.starts_at < day.range.end,
          )}
          planned={day.planned}
          capacity={capacity}
          timezone={timezone}
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}

function AdjustDialog({
  blocks,
  planned,
  capacity,
  timezone,
  onClose,
}: {
  blocks: CalendarBlock[];
  planned: number;
  capacity: number;
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nowMs] = useState(() => Date.now());
  const candidates = blocks.filter((b) => new Date(b.starts_at).getTime() > nowMs);
  const asCandidate = (b: CalendarBlock): OverflowCandidate => ({
    id: b.id,
    minutes: minutesBetween(b.starts_at, b.ends_at),
    priority: b.task.priority,
    starts_at: b.starts_at,
  });
  const [selected, setSelected] = useState<string[]>(() => overflowSelection(candidates.map(asCandidate), planned, capacity));
  const [busy, setBusy] = useState(false);
  const after = planned - candidates.filter((b) => selected.includes(b.id)).reduce((s, b) => s + minutesBetween(b.starts_at, b.ends_at), 0);

  const confirm = async () => {
    setBusy(true);
    let moved = 0;
    let failed = 0;
    for (const b of candidates.filter((x) => selected.includes(x.id))) {
      const r = await rescheduleBlockAction({ blockId: b.id, startsAt: sameTimeTomorrow(b.starts_at, timezone) });
      if (r.ok) moved += 1;
      else failed += 1;
    }
    setBusy(false);
    toast[failed ? "warning" : "success"](`${moved}개 옮김${failed ? `, ${failed}개 실패` : ""}`);
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>계획 조정</DialogTitle>
          <DialogDescription>
            조정 후 계획 {formatMinutes(Math.max(0, after))} · 보통 {formatMinutes(capacity)}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">옮길 수 있는 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((b) => (
              <li key={b.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))
                    }
                  />
                  <span className="tabular-nums">
                    {toLocalTime(b.starts_at, timezone)}–{toLocalTime(b.ends_at, timezone)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMinutes(minutesBetween(b.starts_at, b.ends_at))}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button disabled={busy || selected.length === 0} onClick={confirm}>
            선택한 {selected.length}개를 다음 날 같은 시각으로
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
