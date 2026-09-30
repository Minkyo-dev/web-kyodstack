export const TASK_TYPES = [
  "reading",
  "study",
  "coding",
  "debugging",
  "documentation",
  "writing",
  "meeting",
  "planning",
  "design",
  "research",
  "exercise",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  reading: "읽기",
  study: "공부",
  coding: "코딩",
  debugging: "디버깅",
  documentation: "문서화",
  writing: "글쓰기",
  meeting: "회의",
  planning: "계획",
  design: "디자인",
  research: "조사",
  exercise: "운동",
  other: "기타",
};

export const TAG_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export type TagRef = { id: string; name: string; color: TagColor | null };
export type DomainRef = { id: string; name: string; parent_id: string | null };
