"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionRunner } from "@/hooks/use-action-runner";
import { TERMS } from "@/lib/terms";
import {
  loadNotificationSettingsAction,
  saveNotificationPrefsAction,
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
} from "../actions/notification.actions";
import { DEFAULT_PREFS, type NotifyPrefs } from "../domain/notify";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const KINDS: {
  key: keyof Pick<NotifyPrefs, "block_soon" | "checkin" | "habit_missed" | "change_quiet">;
  label: string;
  hint: string;
}[] = [
  { key: "block_soon", label: "일정 시작 전", hint: "블록 시작 10–15분 전" },
  {
    key: "checkin",
    label: "저녁 체크인",
    hint: "활동한 날, 저녁 시간에 하루 마무리가 없으면",
  },
  {
    key: "habit_missed",
    label: `어제 놓친 ${TERMS.habit}`,
    hint: "오전 8시 이후, 두 번 연속 놓치지 않도록",
  },
  {
    key: "change_quiet",
    label: `조용한 ${TERMS.mission}`,
    hint: "2주 동안 기록이 없으면, 주 1회",
  },
];

type DeviceState = "checking" | "unsupported" | "no-key" | "blocked" | "off" | "on";
const DEVICE_TEXT: Record<DeviceState, string> = {
  checking: "확인 중…",
  unsupported: "이 브라우저는 알림을 지원하지 않아요. iPhone은 홈 화면에 추가한 뒤 사용할 수 있어요.",
  "no-key": "서버에 알림 키가 설정되지 않았어요.",
  blocked: "브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 허용해 주세요.",
  off: "이 기기에서는 알림이 꺼져 있어요.",
  on: "이 기기에서 알림을 받고 있어요.",
};

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Scheduler settings → 알림 (ADR 0043): this device on/off, which notifications, quiet hours, daily cap, test. */
export function NotificationSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { run, pending } = useActionRunner();
  const [device, setDevice] = useState<DeviceState>("checking");
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = () => {
    run(() => loadNotificationSettingsAction({}), {
      onSuccess: async (s) => {
        setPrefs(s.prefs);
        setPublicKey(s.publicKey);
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setDevice("unsupported");
        if (!s.publicKey) return setDevice("no-key");
        if (Notification.permission === "denied") return setDevice("blocked");
        const sub = await currentSubscription();
        setDevice(sub && s.endpoints.includes(sub.endpoint) ? "on" : "off");
      },
    });
  };
  // Load when opened; the effect only starts the async read.
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const failed = (error: unknown) => ({
    ok: false as const,
    code: "INTERNAL_ERROR" as const,
    message: `알림을 설정하지 못했습니다. (${String(error).slice(0, 80)})`,
  });

  const enable = () =>
    run(
      async () => {
        try {
          const reg = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          });
          await navigator.serviceWorker.ready;
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setDevice(permission === "denied" ? "blocked" : "off");
            return {
              ok: false as const,
              code: "VALIDATION_ERROR" as const,
              message: "알림 권한이 필요합니다.",
            };
          }
          const sub =
            (await reg.pushManager.getSubscription()) ??
            (await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: keyBytes(publicKey!),
            }));
          const json = sub.toJSON();
          const result = await subscribePushAction({
            endpoint: sub.endpoint,
            keys: json.keys,
            userAgent: navigator.userAgent.slice(0, 300),
          });
          if (result.ok) setDevice("on");
          return result;
        } catch (error) {
          return failed(error);
        }
      },
      { success: "이 기기에서 알림을 켰습니다." },
    );

  const disable = () =>
    run(
      async () => {
        try {
          const sub = await currentSubscription();
          if (!sub) {
            setDevice("off");
            return { ok: true as const, data: undefined };
          }
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          const result = await unsubscribePushAction({ endpoint });
          if (result.ok) setDevice("off");
          return result;
        } catch (error) {
          return failed(error);
        }
      },
      { success: "이 기기의 알림을 껐습니다." },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>알림</DialogTitle>
          <DialogDescription>비서가 먼저 알려 주는 알림이에요. 꼭 필요한 것만, 하루 최대 횟수 안에서 보냅니다.</DialogDescription>
        </DialogHeader>

        <section aria-label="이 기기" className="space-y-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-2 text-sm">
            {device === "on" ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4 text-muted-foreground" aria-hidden />}
            <span role="status">{DEVICE_TEXT[device]}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {device === "off" && (
              <Button size="sm" disabled={pending} onClick={enable}>
                이 기기에서 켜기
              </Button>
            )}
            {device === "on" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => sendTestPushAction({}), {
                      success: "테스트 알림을 보냈습니다.",
                    })
                  }
                >
                  테스트 알림 보내기
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={disable}>
                  끄기
                </Button>
              </>
            )}
          </div>
        </section>

        <form
          aria-label="알림 설정"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveNotificationPrefsAction(prefs), {
              success: "알림 설정을 저장했습니다.",
            });
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">받을 알림</legend>
            {KINDS.map((k) => (
              <label key={k.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={prefs[k.key]}
                  onChange={(e) => setPrefs({ ...prefs, [k.key]: e.target.checked })}
                />
                <span>
                  {k.label}
                  <span className="block text-xs text-muted-foreground">{k.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              방해 금지 시작
              <select
                className={`${nativeSelectClass} block`}
                value={prefs.quiet_start}
                onChange={(e) => setPrefs({ ...prefs, quiet_start: Number(e.target.value) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{`${h}시`}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              방해 금지 끝
              <select
                className={`${nativeSelectClass} block`}
                value={prefs.quiet_end}
                onChange={(e) => setPrefs({ ...prefs, quiet_end: Number(e.target.value) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{`${h}시`}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              하루 최대
              <select
                className={`${nativeSelectClass} block`}
                value={prefs.daily_cap}
                onChange={(e) => setPrefs({ ...prefs, daily_cap: Number(e.target.value) })}
              >
                {HOURS.slice(1, 11).map((n) => (
                  <option key={n} value={n}>{`${n}개`}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">방해 금지 시간에는 보내지 않고, 나중에 몰아서 보내지도 않아요.</p>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
