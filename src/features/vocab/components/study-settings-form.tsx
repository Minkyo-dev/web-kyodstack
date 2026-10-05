"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { StudySettings } from "../services/settings.service";
import { retryWritebacksAction, updateReminderAction, updateStudySettingsAction } from "../actions/review.actions";

const RETENTIONS = [
  { value: "0.85", label: "85% · 복습 적게" },
  { value: "0.9", label: "90% · 권장" },
  { value: "0.95", label: "95% · 더 확실하게" },
];

/** 설정 → 학습 (spec §10): daily limits, card directions, target retention. */
export function StudySettingsForm({ settings }: { settings: StudySettings }) {
  const { run, pending } = useActionRunner();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const retention = RETENTIONS.some((r) => Number(r.value) === settings.desiredRetention) ? String(settings.desiredRetention) : "0.9";

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            updateStudySettingsAction({
              newPerDay: fd.get("newPerDay"),
              reviewsPerDay: fd.get("reviewsPerDay"),
              desiredRetention: fd.get("desiredRetention"),
              directions: fd.getAll("directions"),
            }),
          { success: "학습 설정을 저장했어요." },
        ).then((r) => setErrors(r.ok ? {} : (r.fieldErrors ?? {})));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="newPerDay">하루 새 단어</Label>
          <Input id="newPerDay" name="newPerDay" type="number" min={0} max={200} defaultValue={settings.newPerDay} />
          {errors.newPerDay && <p className="text-xs text-destructive">0–200 사이로 입력해 주세요.</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="reviewsPerDay">하루 복습 최대</Label>
          <Input id="reviewsPerDay" name="reviewsPerDay" type="number" min={1} max={1000} defaultValue={settings.reviewsPerDay} />
          {errors.reviewsPerDay && <p className="text-xs text-destructive">1–1000 사이로 입력해 주세요.</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="desiredRetention">목표 기억률</Label>
        <select id="desiredRetention" name="desiredRetention" defaultValue={retention} className={nativeSelectClass}>
          {RETENTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-1">
        <legend className="font-medium">카드 방향</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="directions" value="recognition" defaultChecked={settings.directions.includes("recognition")} />
          영어 → 뜻 (알아보기)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="directions" value="recall" defaultChecked={settings.directions.includes("recall")} />
          뜻 → 영어 (떠올리기)
        </label>
        {errors.directions && <p className="text-xs text-destructive">하나 이상 골라 주세요.</p>}
      </fieldset>
      <Button type="submit" size="sm" disabled={pending}>
        저장
      </Button>
    </form>
  );
}

export function WritebackStatus({ pending, stuck }: { pending: number; stuck: number }) {
  const { run, pending: busy } = useActionRunner();
  if (pending === 0) return <p className="text-sm text-muted-foreground">Notion에 보낼 학습 상태가 없어요.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        Notion에 보낼 학습 상태 {pending}건{stuck > 0 ? ` · 실패 ${stuck}건` : ""}
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => retryWritebacksAction({}), { success: "다시 보내는 중이에요." })}>
        다시 시도
      </Button>
    </div>
  );
}

/** 설정 → 알림 (spec §8.2): the daily vocab_due push time. Devices are registered in the planner's 알림 settings. */
export function ReminderForm({ enabled, time }: { enabled: boolean; time: string }) {
  const { run, pending } = useActionRunner();
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => updateReminderAction({ reminderEnabled: fd.get("reminderEnabled") === "on", reminderTime: String(fd.get("reminderTime") ?? "") }), {
          success: "알림 설정을 저장했어요.",
        });
      }}
    >
      <label className="flex items-center gap-2">
        <input type="checkbox" name="reminderEnabled" defaultChecked={enabled} />
        복습할 단어가 있으면 하루 한 번 알려 주기
      </label>
      <div className="flex items-center gap-2">
        <Label htmlFor="reminderTime">알림 시각</Label>
        <Input id="reminderTime" name="reminderTime" type="time" defaultValue={time} className="w-32" required />
      </div>
      <p className="text-xs text-muted-foreground">
        푸시는 이 기기를 플래너 ⚙ → 알림에서 켜 둔 경우에 도착해요. 조용한 시간과 하루 알림 수 제한을 따릅니다.
      </p>
      <Button type="submit" size="sm" disabled={pending}>
        저장
      </Button>
    </form>
  );
}
