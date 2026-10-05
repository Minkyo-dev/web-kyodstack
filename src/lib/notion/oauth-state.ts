import { randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "notion_oauth_state";

export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export type CallbackCheck = { ok: true; code: string } | { ok: false; reason: "denied" | "state" | "code" };

/** The state check comes first, so a forged callback can't even report a denial. Constant-time comparison. */
export function checkCallback(input: { cookieState: string | undefined; queryState: string | null; code: string | null; error: string | null }): CallbackCheck {
  if (!input.cookieState || !input.queryState) return { ok: false, reason: "state" };
  const expected = Buffer.from(input.cookieState);
  const actual = Buffer.from(input.queryState);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "state" };
  if (input.error) return { ok: false, reason: "denied" };
  if (!input.code) return { ok: false, reason: "code" };
  return { ok: true, code: input.code };
}
