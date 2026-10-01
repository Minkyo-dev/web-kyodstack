"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { updateAnalysisScheduleAction } from "../actions/analysis.actions";
import { nativeSelectSmClass } from "@/components/ui/native-select";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const selectClass = nativeSelectSmClass;

/** Weekly analysis time (local), or off (F2 spec §1). */
export function AnalysisSchedule({ weekday, hour }: { weekday: number | null; hour: number }) {
  const { run, pending } = useActionRunner();
  const [d, setD] = useState(weekday === null ? "off" : String(weekday));
  const [h, setH] = useState(String(hour));
  return (
    <form
      aria-label="분석 시간"
      className="flex flex-wrap items-center gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateAnalysisScheduleAction({ weekday: d === "off" ? null : Number(d), hour: Number(h) }), { success: "분석 시간을 저장했습니다." });
      }}
    >
      <label htmlFor="analysis-weekday" className="text-muted-foreground">
        분석 시간
      </label>
      <select id="analysis-weekday" value={d} onChange={(e) => setD(e.target.value)} className={selectClass}>
        <option value="off">끄기</option>
        {WEEKDAYS.map((w, i) => (
          <option key={w} value={i}>
            {w}요일
          </option>
        ))}
      </select>
      <label htmlFor="analysis-hour" className="sr-only">
        시각
      </label>
      <select id="analysis-hour" value={h} onChange={(e) => setH(e.target.value)} disabled={d === "off"} className={selectClass}>
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>
            {String(i).padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <Button type="submit" size="xs" variant="ghost" disabled={pending}>
        저장
      </Button>
    </form>
  );
}
