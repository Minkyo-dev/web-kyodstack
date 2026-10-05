import "server-only";
import { Client, isFullDatabase, isFullDataSource, type CreateDatabaseParameters, type UpdateDataSourceParameters } from "@notionhq/client";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { describeNotionError, toNotionAppError } from "./errors";
import { toGrant, toPageRefs, toPropertyConfigs, toPropertyInfos } from "./mapping";
import type { CreatedDatabase, NotionAuth, NotionGateway, NotionPageRef, NotionPropertyInfo, NotionPropertySpec, OAuthGrant } from "./types";

export const NOTION_VERSION = "2026-03-11";
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

  private async run<T>(op: string, fn: () => Promise<T>): Promise<T> {
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
    });
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
    });
  }

  getDataSourceProperties(auth: NotionAuth, dataSourceId: string): Promise<NotionPropertyInfo[]> {
    return this.run("data_sources.retrieve", async () => {
      const source = await this.client(auth).dataSources.retrieve({ data_source_id: dataSourceId });
      if (!isFullDataSource(source)) throw new AppError("NOTION_ERROR");
      return toPropertyInfos(source.properties);
    });
  }

  addProperties(auth: NotionAuth, dataSourceId: string, properties: readonly NotionPropertySpec[]): Promise<NotionPropertyInfo[]> {
    return this.run("data_sources.update", async () => {
      const source = await this.client(auth).dataSources.update({
        data_source_id: dataSourceId,
        properties: toPropertyConfigs(properties) as UpdateDataSourceParameters["properties"],
      });
      if (!isFullDataSource(source)) throw new AppError("NOTION_ERROR");
      return toPropertyInfos(source.properties);
    });
  }
}
