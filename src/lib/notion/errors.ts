import { APIErrorCode, ClientErrorCode, isNotionClientError } from "@notionhq/client";
import { AppError } from "@/lib/errors";

/** Notion SDK error → AppError. The Notion message never reaches the user (spec §11). */
export function toNotionAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isNotionClientError(error)) {
    switch (error.code) {
      case APIErrorCode.Unauthorized:
        return new AppError("NOTION_REAUTH_REQUIRED");
      case APIErrorCode.RateLimited:
        return new AppError("NOTION_RATE_LIMITED");
      case APIErrorCode.ObjectNotFound:
      case APIErrorCode.RestrictedResource:
        return new AppError("NOT_FOUND", "Notion에서 찾을 수 없어요. 페이지가 공유돼 있는지 확인해 주세요.");
      case APIErrorCode.InternalServerError:
      case APIErrorCode.ServiceOverload:
      case APIErrorCode.ServiceUnavailable:
      case APIErrorCode.GatewayTimeout:
      case ClientErrorCode.RequestTimeout:
        return new AppError("NOTION_UNAVAILABLE");
    }
    const status = (error as { status?: number }).status;
    if (status !== undefined && status >= 500) return new AppError("NOTION_UNAVAILABLE");
    return new AppError("NOTION_ERROR");
  }
  if (error instanceof TypeError) return new AppError("NOTION_UNAVAILABLE"); // fetch failed: DNS, reset, offline
  return new AppError("NOTION_ERROR");
}

/** Log-safe description: status, Notion code and class name. Never the message or body. */
export function describeNotionError(error: unknown): { status?: number; code?: string; name?: string } {
  if (isNotionClientError(error)) {
    const status = (error as { status?: number }).status;
    return { ...(status !== undefined ? { status } : {}), code: error.code, name: error.name };
  }
  return { name: error instanceof Error ? error.name : typeof error };
}
