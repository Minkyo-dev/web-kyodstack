export const TASK_STATUSES = [
  "inbox",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OPEN_TASK_STATUSES = ["inbox", "planned", "in_progress"] as const;

export const BLOCK_STATUSES = ["planned", "completed", "skipped", "cancelled"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export const BLOCK_SOURCES = ["manual", "duration_recommendation", "ai_recommendation"] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];

/** Spec §26.2 generic fallback when neither the user nor the template gives an estimate. */
export const GENERIC_ESTIMATE_MINUTES = 60;

/** Weekly calendar fetch buffer (spec §50: selected week ± small buffer). */
export const WEEK_FETCH_BUFFER_DAYS = 1;

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "대기",
  planned: "계획됨",
  in_progress: "진행 중",
  completed: "완료",
  cancelled: "취소",
};

export const BLOCK_STATUS_LABEL: Record<BlockStatus, string> = {
  planned: "계획",
  completed: "완료",
  skipped: "건너뜀",
  cancelled: "취소",
};

/** Optional pause reasons (requirements §12). Never required. */
export const PAUSE_REASONS = ["coffee", "phone", "meeting", "break", "other"] as const;
export const PAUSE_REASON_LABEL: Record<(typeof PAUSE_REASONS)[number], string> = {
  coffee: "커피",
  phone: "전화",
  meeting: "회의",
  break: "휴식",
  other: "기타",
};
