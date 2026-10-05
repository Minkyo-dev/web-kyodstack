import "server-only";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";
import { ClientNotionGateway } from "./client-gateway";
import { FakeNotionGateway } from "./fake-gateway";
import { parseTokenKey } from "./token-crypto";
import type { NotionGateway } from "./types";

export function getNotionGateway(): NotionGateway {
  if (serverEnv.NOTION_GATEWAY === "fake") {
    if (process.env.NODE_ENV === "production") throw new AppError("NOTION_NOT_CONFIGURED", "NOTION_GATEWAY=fake는 개발·테스트 전용이에요.");
    return new FakeNotionGateway();
  }
  if (!serverEnv.NOTION_CLIENT_ID || !serverEnv.NOTION_CLIENT_SECRET) {
    throw new AppError("NOTION_NOT_CONFIGURED", "NOTION_CLIENT_ID와 NOTION_CLIENT_SECRET을 설정해 주세요.");
  }
  return new ClientNotionGateway(serverEnv.NOTION_CLIENT_ID, serverEnv.NOTION_CLIENT_SECRET);
}

export function notionTokenKey(): Buffer {
  return parseTokenKey(serverEnv.NOTION_TOKEN_KEY);
}

export function notionRedirectUri(origin: string): string {
  return serverEnv.NOTION_REDIRECT_URI ?? `${origin}/api/notion/callback`;
}
