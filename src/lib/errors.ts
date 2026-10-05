import type { ProgressDelta } from "./progress";

export const ERROR_CODES = [
  "AUTH_REQUIRED",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "ACTIVE_TIMER_EXISTS",
  "INVALID_TIME_RANGE",
  "DATABASE_ERROR",
  "AI_PROVIDER_ERROR",
  "AI_OUTPUT_INVALID",
  "AI_BUDGET_EXCEEDED",
  "NOTION_NOT_CONNECTED",
  "NOTION_NOT_CONFIGURED",
  "NOTION_REAUTH_REQUIRED",
  "NOTION_RATE_LIMITED",
  "NOTION_UNAVAILABLE",
  "NOTION_SCHEMA_MISMATCH",
  "NOTION_ERROR",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED: "로그인이 필요합니다.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  VALIDATION_ERROR: "입력값을 확인해 주세요.",
  CONFLICT: "다른 변경과 충돌했습니다. 새로고침 후 다시 시도해 주세요.",
  ACTIVE_TIMER_EXISTS: "이미 실행 중인 타이머가 있습니다.",
  INVALID_TIME_RANGE: "종료 시간은 시작 시간보다 늦어야 합니다.",
  DATABASE_ERROR: "저장 중 문제가 발생했습니다.",
  AI_PROVIDER_ERROR: "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
  AI_OUTPUT_INVALID: "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.",
  AI_BUDGET_EXCEEDED: "오늘 AI 사용량을 다 썼어요. 내일 다시 시도해 주세요.",
  NOTION_NOT_CONNECTED: "Notion을 먼저 연결해 주세요.",
  NOTION_NOT_CONFIGURED: "서버의 Notion 연동 설정이 올바르지 않아요. NOTION_CLIENT_ID · NOTION_CLIENT_SECRET · NOTION_TOKEN_KEY를 확인해 주세요.",
  NOTION_REAUTH_REQUIRED: "Notion 연결이 만료됐어요. 다시 연결해 주세요.",
  NOTION_RATE_LIMITED: "Notion이 잠시 바빠요. 잠시 후 다시 시도해 주세요.",
  NOTION_UNAVAILABLE: "Notion에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.",
  NOTION_SCHEMA_MISMATCH: "Notion 단어장의 속성이 바뀌었어요. 설정에서 속성을 복구해 주세요.",
  NOTION_ERROR: "Notion 요청을 처리하지 못했어요.",
  INTERNAL_ERROR: "알 수 없는 오류가 발생했습니다.",
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
  }
}

/** Serializable result returned from every Server Action. Never carries raw DB errors. */
export type ActionResult<T = void> =
  | { ok: true; data: T; progress?: ProgressDelta }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<void>;
export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data: data as T };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }
  return { ok: false, code: "INTERNAL_ERROR", message: DEFAULT_MESSAGES.INTERNAL_ERROR };
}

type PostgrestLikeError = { code?: string; message?: string };

/** Map a Supabase/Postgres error to an AppError without leaking details. */
export function fromDbError(error: PostgrestLikeError): AppError {
  switch (error.code) {
    case "PGRST116":
    case "P0002":
      return new AppError("NOT_FOUND");
    case "23505":
      return new AppError("CONFLICT");
    case "23503":
      return new AppError("NOT_FOUND");
    case "23514":
    case "22007":
    case "22008":
      return new AppError("VALIDATION_ERROR");
    case "42501":
      return new AppError("NOT_FOUND");
    default:
      return new AppError("DATABASE_ERROR");
  }
}
