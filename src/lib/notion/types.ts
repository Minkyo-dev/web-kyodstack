/** Vendor-neutral Notion boundary (ADR 0046). Features depend on these types, never on the SDK. */
export type NotionAuth = { accessToken: string };
export type OAuthGrant = { accessToken: string; refreshToken: string | null; workspaceId: string; workspaceName: string | null; botId: string };
export type NotionPropertyType = "title" | "rich_text" | "select" | "multi_select" | "status" | "date";
export type NotionPropertySpec = { name: string; type: NotionPropertyType; options?: readonly string[] };
export type NotionPropertyInfo = { id: string; name: string; type: string };
export type NotionPageRef = { id: string; title: string; url: string };
export type CreatedDatabase = { databaseId: string; dataSourceId: string; url: string; properties: NotionPropertyInfo[] };

export interface NotionGateway {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthGrant>;
  refresh(refreshToken: string): Promise<OAuthGrant>;
  revoke(accessToken: string): Promise<void>;
  searchPages(auth: NotionAuth): Promise<NotionPageRef[]>;
  createDatabase(auth: NotionAuth, input: { parentPageId: string; title: string; properties: readonly NotionPropertySpec[] }): Promise<CreatedDatabase>;
  getDataSourceProperties(auth: NotionAuth, dataSourceId: string): Promise<NotionPropertyInfo[]>;
  /** Adds properties and returns the data source's full property list afterwards. */
  addProperties(auth: NotionAuth, dataSourceId: string, properties: readonly NotionPropertySpec[]): Promise<NotionPropertyInfo[]>;
}
