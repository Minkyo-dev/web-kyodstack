import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { NotionAuth, NotionGateway, NotionPageRef, NotionPropertyInfo, NotionPropertySpec, OAuthGrant } from "./types";

type Store = Map<string, NotionPropertyInfo[]>;
const holder = globalThis as typeof globalThis & { __fakeNotionStore?: Store };

/** Data sources created by the fake in this process (tests may edit it to simulate changes made in Notion). */
export function fakeNotionStore(): Store {
  return (holder.__fakeNotionStore ??= new Map());
}

export const FAKE_GRANT: OAuthGrant = {
  accessToken: "fake-access", refreshToken: "fake-refresh", workspaceId: "fake-workspace", workspaceName: "[e2e] Fake workspace", botId: "fake-bot",
};
export const FAKE_PARENT_PAGE: NotionPageRef = { id: "11111111-1111-4111-8111-111111111111", title: "[e2e] 공유 페이지", url: "https://www.notion.so/fake-parent" };

/** NOTION_GATEWAY=fake: deterministic Notion for unit tests and E2E. Refused in production by the factory. */
export class FakeNotionGateway implements NotionGateway {
  authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(redirectUri);
    url.searchParams.set("code", "fake-code");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthGrant> {
    if (code !== "fake-code" || !redirectUri) throw new AppError("NOTION_ERROR");
    return { ...FAKE_GRANT };
  }

  async refresh(refreshToken: string): Promise<OAuthGrant> {
    if (refreshToken !== FAKE_GRANT.refreshToken) throw new AppError("NOTION_REAUTH_REQUIRED");
    return { ...FAKE_GRANT };
  }

  async revoke(): Promise<void> {}

  async searchPages(auth: NotionAuth): Promise<NotionPageRef[]> {
    this.check(auth);
    return [FAKE_PARENT_PAGE];
  }

  async createDatabase(auth: NotionAuth, input: { parentPageId: string; title: string; properties: readonly NotionPropertySpec[] }) {
    this.check(auth);
    if (input.parentPageId !== FAKE_PARENT_PAGE.id) throw new AppError("NOT_FOUND");
    const databaseId = randomUUID();
    const dataSourceId = randomUUID();
    const properties = input.properties.map((p, i) => ({ id: p.type === "title" ? "title" : `fake${i}`, name: p.name, type: p.type }));
    fakeNotionStore().set(dataSourceId, properties);
    return { databaseId, dataSourceId, url: `https://www.notion.so/${databaseId.replaceAll("-", "")}`, properties: [...properties] };
  }

  async getDataSourceProperties(auth: NotionAuth, dataSourceId: string): Promise<NotionPropertyInfo[]> {
    this.check(auth);
    const properties = fakeNotionStore().get(dataSourceId);
    if (!properties) throw new AppError("NOT_FOUND");
    return [...properties];
  }

  async addProperties(auth: NotionAuth, dataSourceId: string, specs: readonly NotionPropertySpec[]): Promise<NotionPropertyInfo[]> {
    const current = await this.getDataSourceProperties(auth, dataSourceId);
    const next = [...current, ...specs.map((s, i) => ({ id: `fake-added-${current.length + i}`, name: s.name, type: s.type }))];
    fakeNotionStore().set(dataSourceId, next);
    return [...next];
  }

  private check(auth: NotionAuth) {
    if (auth.accessToken !== FAKE_GRANT.accessToken) throw new AppError("NOTION_REAUTH_REQUIRED");
  }
}
