"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { updateWorkStandardsAction } from "../actions/work-standards.actions";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Standards = { planned_work_days: number[]; min_meaningful_minutes: number; commit_lead_minutes: number };

/**
 * Work days, meaningful-day minimum and commitment lead (D2 spec §3). Uncontrolled with its own trigger
 * (progress page), or controlled via open/onOpenChange (scheduler ⚙ menu).
 */
export function WorkStandardsDialog({
  settings,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
}: {
  settings: Standards;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const { run, pending } = useActionRunner();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;

  return (
    <>
      {trigger && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          작업 기준
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(
                () =>
                  updateWorkStandardsAction({
                    plannedWorkDays: fd.getAll("days").map(Number),
                    minMeaningfulMinutes: fd.get("minMeaningful"),
                    commitLeadMinutes: fd.get("commitLead"),
                  }),
                { success: "저장했습니다.", onSuccess: () => setOpen(false) },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>작업 기준</DialogTitle>
              <DialogDescription>꾸준함·계획 이행·회복력을 계산하는 기준입니다.</DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-4">
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">근무 요일</legend>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((label, i) => (
                    <label key={i} className="inline-flex items-center gap-1 text-sm">
                      <input type="checkbox" name="days" value={i} defaultChecked={settings.planned_work_days.includes(i)} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">꾸준함은 이 요일들만 봅니다.</p>
              </fieldset>
              <div className="space-y-1">
                <label htmlFor="ws-min" className="text-sm font-medium">
                  최소 작업 시간(분)
                </label>
                <Input
                  id="ws-min"
                  name="minMeaningful"
                  type="number"
                  min={5}
                  max={480}
                  required
                  defaultValue={settings.min_meaningful_minutes}
                />
                <p className="text-xs text-muted-foreground">이만큼 작업한 날을 의미 있게 일한 날로 봅니다.</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="ws-lead" className="text-sm font-medium">
                  약속 블록 기준(분)
                </label>
                <Input
                  id="ws-lead"
                  name="commitLead"
                  type="number"
                  min={0}
                  max={1440}
                  required
                  defaultValue={settings.commit_lead_minutes}
                />
                <p className="text-xs text-muted-foreground">시작 이만큼 전에 잡힌 일정만 계획 이행에 셉니다.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
