import "server-only";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";
import { ClientNotionGateway } from "./client-gateway";
import { FakeNotionGateway } from "./fake-gateway";
import type { NotionGateway } from "./types";

export function getNotionGateway(): NotionGateway {
  if (serverEnv.NOTION_GATEWAY === "fake") {
    if (process.env.NODE_ENV === "production") throw new AppError("NOTION_ERROR", "Notion 연동 설정이 올바르지 않습니다.");
    return new FakeNotionGateway();
  }
  if (!serverEnv.NOTION_CLIENT_ID || !serverEnv.NOTION_CLIENT_SECRET) throw new AppError("NOTION_ERROR", "Notion 연동 설정이 없습니다.");
  return new ClientNotionGateway(serverEnv.NOTION_CLIENT_ID, serverEnv.NOTION_CLIENT_SECRET);
}

export function notionTokenKey(): Buffer {
  if (!serverEnv.NOTION_TOKEN_KEY) throw new AppError("NOTION_ERROR", "Notion 연동 설정이 없습니다.");
  return Buffer.from(serverEnv.NOTION_TOKEN_KEY, "base64");
}

export function notionRedirectUri(origin: string): string {
  return serverEnv.NOTION_REDIRECT_URI ?? `${origin}/api/notion/callback`;
}
