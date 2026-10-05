import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getNotionGateway, notionRedirectUri, notionTokenKey } from "@/lib/notion";
import { newOAuthState, OAUTH_STATE_COOKIE } from "@/lib/notion/oauth-state";

/** Starts Notion OAuth (spec §5.2). The state is bound to a short-lived httpOnly cookie scoped to /api/notion. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/english/settings", origin));
  try {
    notionTokenKey(); // fail before the Notion consent screen, not after it
    const state = newOAuthState();
    const response = NextResponse.redirect(getNotionGateway().authorizeUrl(state, notionRedirectUri(origin)));
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/notion",
    });
    return response;
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log({ action: "notion.connect", userId: user.id, success: false, errorCode: code, detail: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(new URL(`/english/settings?error=${code}`, origin));
  }
}
