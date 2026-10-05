import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { NotionAuth, NotionGateway, NotionPage, NotionPageRef, NotionPropertyInfo, NotionPropertySpec, NotionValue, OAuthGrant } from "./types";

type Store = Map<string, NotionPropertyInfo[]>;
type FakePage = NotionPage & { dataSourceId: string };
const holder = globalThis as typeof globalThis & { __fakeNotionStore?: Store; __fakeNotionPages?: Map<string, FakePage> };

/** Data sources created by the fake in this process (tests may edit it to simulate changes made in Notion). */
export function fakeNotionStore(): Store {
  return (holder.__fakeNotionStore ??= new Map());
}

/** Pages created by the fake in this process, by page id. */
export function fakeNotionPages(): Map<string, FakePage> {
  return (holder.__fakeNotionPages ??= new Map());
}

/** Notion rounds last_edited_time down to the minute; the fake does the same so the pull overlap is exercised. */
function minuteNow(): string {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

const PAGE_SIZE = 100;

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

  async queryPages(auth: NotionAuth, dataSourceId: string, opts: { editedOnOrAfter?: string; cursor?: string }) {
    this.check(auth);
    const live = [...fakeNotionPages().values()]
      .filter((p) => p.dataSourceId === dataSourceId && !p.inTrash && (!opts.editedOnOrAfter || p.lastEditedTime >= opts.editedOnOrAfter))
      .sort((a, b) => a.lastEditedTime.localeCompare(b.lastEditedTime));
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const pages = live.slice(start, start + PAGE_SIZE).map(strip);
    return { pages, nextCursor: start + PAGE_SIZE < live.length ? String(start + PAGE_SIZE) : null };
  }

  async createPage(auth: NotionAuth, dataSourceId: string, values: Record<string, NotionValue>): Promise<NotionPage> {
    await this.getDataSourceProperties(auth, dataSourceId);
    const id = randomUUID();
    const now = minuteNow();
    const page: FakePage = { id, dataSourceId, url: `https://www.notion.so/${id.replaceAll("-", "")}`, createdTime: now, lastEditedTime: now, inTrash: false, properties: { ...values } };
    fakeNotionPages().set(id, page);
    return strip(page);
  }

  async updatePage(auth: NotionAuth, pageId: string, values: Record<string, NotionValue>): Promise<NotionPage> {
    this.check(auth);
    const page = fakeNotionPages().get(pageId);
    if (!page || page.inTrash) throw new AppError("NOT_FOUND");
    const next: FakePage = { ...page, lastEditedTime: minuteNow(), properties: { ...page.properties, ...values } };
    fakeNotionPages().set(pageId, next);
    return strip(next);
  }

  async trashPage(auth: NotionAuth, pageId: string): Promise<void> {
    this.check(auth);
    const page = fakeNotionPages().get(pageId);
    if (!page || page.inTrash) throw new AppError("NOT_FOUND");
    fakeNotionPages().set(pageId, { ...page, inTrash: true, lastEditedTime: minuteNow() });
  }

  private check(auth: NotionAuth) {
    if (auth.accessToken !== FAKE_GRANT.accessToken) throw new AppError("NOTION_REAUTH_REQUIRED");
  }
}

function strip({ dataSourceId: _ds, ...page }: FakePage): NotionPage {
  void _ds;
  return { ...page, properties: { ...page.properties } };
}
