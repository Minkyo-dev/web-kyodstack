"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

const KEY = "kyod.banner.templateType";
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** One-time hint: templates without a type learn only through their name tag (D1 spec §3). */
export function TemplateTypeBanner({ count, onManage }: { count: number; onManage: () => void }) {
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readDismissed,
    () => true, // server: render nothing until the client knows
  );
  if (count === 0 || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private mode or blocked storage: the banner just comes back next time.
    }
    listeners.forEach((l) => l());
  };

  return (
    <div role="note" className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
      <p className="flex-1">
        템플릿 {count}개에 유형이 없습니다. 유형을 지정하면 추천이 더 정확해집니다.{" "}
        <button type="button" className="underline underline-offset-2" onClick={onManage}>
          분류 관리
        </button>
      </p>
      <button type="button" aria-label="안내 닫기" onClick={dismiss}>
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
