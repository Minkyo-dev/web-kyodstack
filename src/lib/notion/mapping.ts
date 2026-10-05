import type { DataSourceObjectResponse, SearchResponse } from "@notionhq/client";
import type { NotionPageRef, NotionPropertyInfo, NotionPropertySpec, OAuthGrant } from "./types";

export function toPropertyConfig(spec: NotionPropertySpec): Record<string, unknown> {
  const options = (spec.options ?? []).map((name) => ({ name }));
  switch (spec.type) {
    case "title":
      return { title: {} };
    case "rich_text":
      return { rich_text: {} };
    case "date":
      return { date: {} };
    case "select":
      return { select: { options } };
    case "multi_select":
      return { multi_select: { options } };
    case "status":
      return { status: { options } };
  }
}

export function toPropertyConfigs(specs: readonly NotionPropertySpec[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(specs.map((spec) => [spec.name, toPropertyConfig(spec)]));
}

export function toPropertyInfos(properties: DataSourceObjectResponse["properties"]): NotionPropertyInfo[] {
  return Object.values(properties).map((p) => ({ id: p.id, name: p.name, type: p.type }));
}

/** Pages the user can pick as the DB's parent: not trashed, not a row of some database. */
export function toPageRefs(results: SearchResponse["results"]): NotionPageRef[] {
  return results.flatMap((r) => {
    if (r.object !== "page" || !("properties" in r)) return [];
    if (r.in_trash || r.parent.type === "data_source_id" || r.parent.type === "database_id") return [];
    const titleProp = Object.values(r.properties).find((p) => p.type === "title");
    const title = titleProp?.type === "title" ? titleProp.title.map((t) => t.plain_text).join("").trim() : "";
    return [{ id: r.id, title: title || "제목 없음", url: r.url }];
  });
}

type TokenResponseLike = { access_token: string; refresh_token: string | null; workspace_id: string; workspace_name: string | null; bot_id: string };

export function toGrant(r: TokenResponseLike): OAuthGrant {
  return { accessToken: r.access_token, refreshToken: r.refresh_token, workspaceId: r.workspace_id, workspaceName: r.workspace_name, botId: r.bot_id };
}
