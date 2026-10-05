import { Circle, CircleCheck, CircleDot, Minus } from "lucide-react";

/** 상태 as icon + text (never color alone). */
export function StudyStatusBadge({ status }: { status: string | null }) {
  const Icon = status === "학습 완료" ? CircleCheck : status === "학습 중" ? CircleDot : status ? Circle : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {status ?? "—"}
    </span>
  );
}
