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
  | { ok: true; data: T }
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
