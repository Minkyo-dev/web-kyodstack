"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createTaskInRangeAction } from "../actions/schedule.actions";
import { formatMinutes, minutesBetween } from "../utils/duration";
import { toLocalDate, toLocalTime } from "../utils/timezone";

/** Click-drag on an empty range → name it → task + block (spec §12). */
export function CreateInRangeDialog({
  range,
  timezone,
  onClose,
}: {
  range: { start: string; end: string } | null;
  timezone: string;
  onClose: () => void;
}) {
  const { run, pending } = useActionRunner();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={range !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent initialFocus={inputRef}>
        {range && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = new FormData(e.currentTarget).get("title");
              run(
                () => createTaskInRangeAction({ title, startsAt: range.start, endsAt: range.end }),
                { onSuccess: onClose },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>새 일정</DialogTitle>
              <DialogDescription>
                {toLocalDate(range.start, timezone)} {toLocalTime(range.start, timezone)}–
                {toLocalTime(range.end, timezone)} ({formatMinutes(minutesBetween(range.start, range.end))})
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-1.5">
              <Label htmlFor="range-task-title">할 일</Label>
              <Input id="range-task-title" name="title" ref={inputRef} required maxLength={200} autoComplete="off" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                추가
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
