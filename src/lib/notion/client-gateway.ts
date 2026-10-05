import "server-only";
import {
  Client, isFullDatabase, isFullDataSource, isFullPage,
  type CreateDatabaseParameters, type CreatePageParameters, type UpdateDataSourceParameters,
} from "@notionhq/client";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { describeNotionError, toNotionAppError } from "./errors";
import { createThrottle } from "./throttle";
import { toGrant, toNotionPage, toPageRefs, toPropertyConfigs, toPropertyInfos, toPropertyValues } from "./mapping";
import type { CreatedDatabase, NotionAuth, NotionGateway, NotionPage, NotionPageRef, NotionPropertyInfo, NotionPropertySpec, NotionValue, OAuthGrant } from "./types";

export const NOTION_VERSION = "2026-03-11";
/** ~3 requests per second per token (spec §5.4); shared by every gateway instance in this process. */
const throttle = createThrottle(334);
type PageProperties = CreatePageParameters["properties"];
type InitialProperties = NonNullable<NonNullable<CreateDatabaseParameters["initial_data_source"]>["properties"]>;

/** @notionhq/client behind NotionGateway. The SDK retries 429/5xx and honors Retry-After (ADR 0046). */
export class ClientNotionGateway implements NotionGateway {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private client(auth?: NotionAuth) {
    return new Client({
      auth: auth?.accessToken,
      notionVersion: NOTION_VERSION,
      timeoutMs: 20_000,
      retry: { maxRetries: 3, initialRetryDelayMs: 1_000, maxRetryDelayMs: 10_000 },
    });
  }

  private async run<T>(op: string, fn: () => Promise<T>, auth?: NotionAuth): Promise<T> {
    if (auth) await throttle(auth.accessToken);
    try {
      return await fn();
    } catch (error) {
      const mapped = toNotionAppError(error);
      log({ action: `notion.${op}`, success: false, errorCode: mapped.code, detail: describeNotionError(error) });
      throw mapped;
    }
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({ client_id: this.clientId, response_type: "code", owner: "user", redirect_uri: redirectUri, state });
    return `https://api.notion.com/v1/oauth/authorize?${params}`;
  }

  exchangeCode(code: string, redirectUri: string): Promise<OAuthGrant> {
    return this.run("oauth.token", async () =>
      toGrant(await this.client().oauth.token({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri })),
    );
  }

  refresh(refreshToken: string): Promise<OAuthGrant> {
    return this.run("oauth.refresh", async () =>
      toGrant(await this.client().oauth.token({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken })),
    );
  }

  revoke(accessToken: string): Promise<void> {
    return this.run("oauth.revoke", async () => {
      await this.client().oauth.revoke({ client_id: this.clientId, client_secret: this.clientSecret, token: accessToken });
    });
  }

  searchPages(auth: NotionAuth): Promise<NotionPageRef[]> {
    return this.run("search", async () => {
      const res = await this.client(auth).search({
        filter: { property: "object", value: "page" },
        sort: { timestamp: "last_edited_time", direction: "descending" },
        page_size: 50,
      });
      return toPageRefs(res.results);
    }, auth);
  }

  createDatabase(auth: NotionAuth, input: { parentPageId: string; title: string; properties: readonly NotionPropertySpec[] }): Promise<CreatedDatabase> {
    return this.run("databases.create", async () => {
      const client = this.client(auth);
      const db = await client.databases.create({
        parent: { type: "page_id", page_id: input.parentPageId },
        title: [{ type: "text", text: { content: input.title } }],
        initial_data_source: { properties: toPropertyConfigs(input.properties) as InitialProperties },
      });
      const sourceId = isFullDatabase(db) ? db.data_sources[0]?.id : undefined;
      if (!isFullDatabase(db) || !sourceId) throw new AppError("NOTION_ERROR");
      const source = await client.dataSources.retrieve({ data_source_id: sourceId });
      if (!isFullDataSource(source)) throw new AppError("NOTION_ERROR");
      return { databaseId: db.id, dataSourceId: source.id, url: db.url, properties: toPropertyInfos(source.properties) };
    }, auth);
  }

  getDataSourceProperties(auth: NotionAuth, dataSourceId: string): Promise<NotionPropertyInfo[]> {
    return this.run("data_sources.retrieve", async () => {
      const source = await this.client(auth).dataSources.retrieve({ data_source_id: dataSourceId });
      if (!isFullDataSource(source)) throw new AppError("NOTION_ERROR");
      return toPropertyInfos(source.properties);
    }, auth);
  }

  addProperties(auth: NotionAuth, dataSourceId: string, properties: readonly NotionPropertySpec[]): Promise<NotionPropertyInfo[]> {
    return this.run("data_sources.update", async () => {
      const source = await this.client(auth).dataSources.update({
        data_source_id: dataSourceId,
        properties: toPropertyConfigs(properties) as UpdateDataSourceParameters["properties"],
      });
      if (!isFullDataSource(source)) throw new AppError("NOTION_ERROR");
      return toPropertyInfos(source.properties);
    }, auth);
  }

  queryPages(auth: NotionAuth, dataSourceId: string, opts: { editedOnOrAfter?: string; cursor?: string }): Promise<{ pages: NotionPage[]; nextCursor: string | null }> {
    return this.run("data_sources.query", async () => {
      const res = await this.client(auth).dataSources.query({
        data_source_id: dataSourceId,
        page_size: 100,
        start_cursor: opts.cursor,
        filter: opts.editedOnOrAfter ? { timestamp: "last_edited_time", last_edited_time: { on_or_after: opts.editedOnOrAfter } } : undefined,
        sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      });
      return { pages: res.results.filter(isFullPage).map(toNotionPage), nextCursor: res.has_more ? res.next_cursor : null };
    }, auth);
  }

  createPage(auth: NotionAuth, dataSourceId: string, values: Record<string, NotionValue>): Promise<NotionPage> {
    return this.run("pages.create", async () => {
      const page = await this.client(auth).pages.create({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: toPropertyValues(values) as PageProperties,
      });
      if (!isFullPage(page)) throw new AppError("NOTION_ERROR");
      return toNotionPage(page);
    }, auth);
  }

  updatePage(auth: NotionAuth, pageId: string, values: Record<string, NotionValue>): Promise<NotionPage> {
    return this.run("pages.update", async () => {
      const page = await this.client(auth).pages.update({ page_id: pageId, properties: toPropertyValues(values) as PageProperties });
      if (!isFullPage(page)) throw new AppError("NOTION_ERROR");
      return toNotionPage(page);
    }, auth);
  }

  trashPage(auth: NotionAuth, pageId: string): Promise<void> {
    return this.run("pages.trash", async () => {
      await this.client(auth).pages.update({ page_id: pageId, in_trash: true });
    }, auth);
  }
}
