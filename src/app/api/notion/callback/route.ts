import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { notionRedirectUri } from "@/lib/notion";
import { checkCallback, OAUTH_STATE_COOKIE } from "@/lib/notion/oauth-state";
import { createClient } from "@/lib/supabase/server";
import { completeOAuth } from "@/features/vocab/services/connection.service";

/** Notion redirects here. The connection always belongs to the session user, never to anything in the URL. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/english/settings", origin));

  const params = request.nextUrl.searchParams;
  const check = checkCallback({
    cookieState: request.cookies.get(OAUTH_STATE_COOKIE)?.value,
    queryState: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
  });
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/notion" });
    return response;
  };

  const startedAt = Date.now();
  if (!check.ok) {
    log({ action: "notion.callback", userId: user.id, success: false, detail: { reason: check.reason } });
    return finish(`/english/settings?error=oauth_${check.reason}`);
  }
  try {
    await completeOAuth({ user, supabase: await createClient() }, check.code, notionRedirectUri(origin));
    log({ action: "notion.callback", userId: user.id, success: true, durationMs: Date.now() - startedAt });
    return finish("/english/settings?setup=1");
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log({ action: "notion.callback", userId: user.id, success: false, errorCode: code, durationMs: Date.now() - startedAt, detail: error instanceof AppError ? undefined : String(error) });
    return finish(`/english/settings?error=${code}`);
  }
}
