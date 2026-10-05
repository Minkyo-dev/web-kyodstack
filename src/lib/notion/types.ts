/** Vendor-neutral Notion boundary (ADR 0046). Features depend on these types, never on the SDK. */
export type NotionAuth = { accessToken: string };
export type OAuthGrant = { accessToken: string; refreshToken: string | null; workspaceId: string; workspaceName: string | null; botId: string };
export type NotionPropertyType = "title" | "rich_text" | "select" | "multi_select" | "status" | "date";
export type NotionPropertySpec = { name: string; type: NotionPropertyType; options?: readonly string[] };
export type NotionPropertyInfo = { id: string; name: string; type: string };
export type NotionPageRef = { id: string; title: string; url: string };
/** One property value, keyed by property id in NotionPage (renames in Notion don't matter). */
export type NotionValue =
  | { type: "title" | "rich_text"; text: string }
  | { type: "select" | "status"; name: string | null }
  | { type: "multi_select"; names: string[] }
  | { type: "date"; start: string | null }
  | { type: "other" };
export type NotionPage = {
  id: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  inTrash: boolean;
  properties: Record<string, NotionValue>;
};
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
  /** Non-trashed pages, oldest edit first, 100 per call. */
  queryPages(auth: NotionAuth, dataSourceId: string, opts: { editedOnOrAfter?: string; cursor?: string }): Promise<{ pages: NotionPage[]; nextCursor: string | null }>;
  createPage(auth: NotionAuth, dataSourceId: string, values: Record<string, NotionValue>): Promise<NotionPage>;
  /** Sends only the given properties. */
  updatePage(auth: NotionAuth, pageId: string, values: Record<string, NotionValue>): Promise<NotionPage>;
  trashPage(auth: NotionAuth, pageId: string): Promise<void>;
}
