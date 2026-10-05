import type { DataSourceObjectResponse, PageObjectResponse, SearchResponse } from "@notionhq/client";
import type { NotionPage, NotionPageRef, NotionPropertyInfo, NotionPropertySpec, NotionValue, OAuthGrant } from "./types";

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

/** Notion caps one text object at 2000 characters. */
const TEXT_CHUNK = 2000;

function richText(text: string) {
  const parts: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += TEXT_CHUNK) parts.push({ type: "text", text: { content: text.slice(i, i + TEXT_CHUNK) } });
  return parts;
}

function toPropertyValue(value: NotionValue): Record<string, unknown> | null {
  switch (value.type) {
    case "title":
      return { title: richText(value.text) };
    case "rich_text":
      return { rich_text: richText(value.text) };
    case "select":
      return { select: value.name ? { name: value.name } : null };
    case "status":
      return { status: value.name ? { name: value.name } : null };
    case "multi_select":
      return { multi_select: value.names.map((name) => ({ name })) };
    case "date":
      return { date: value.start ? { start: value.start } : null };
    case "other":
      return null;
  }
}

/** Request body `properties`, keyed by property id (Notion accepts ids as keys). */
export function toPropertyValues(values: Record<string, NotionValue>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([id, value]) => {
      const body = toPropertyValue(value);
      return body ? [[id, body]] : [];
    }),
  );
}

type RichTextLike = { plain_text: string }[];

function fromProperty(p: PageObjectResponse["properties"][string]): NotionValue {
  switch (p.type) {
    case "title":
      return { type: "title", text: (p.title as RichTextLike).map((t) => t.plain_text).join("") };
    case "rich_text":
      return { type: "rich_text", text: (p.rich_text as RichTextLike).map((t) => t.plain_text).join("") };
    case "select":
      return { type: "select", name: p.select?.name ?? null };
    case "status":
      return { type: "status", name: p.status?.name ?? null };
    case "multi_select":
      return { type: "multi_select", names: p.multi_select.map((o) => o.name) };
    case "date":
      return { type: "date", start: p.date?.start ?? null };
    default:
      return { type: "other" };
  }
}

export function toNotionPage(page: PageObjectResponse): NotionPage {
  return {
    id: page.id,
    url: page.url,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    inTrash: page.in_trash,
    properties: Object.fromEntries(Object.values(page.properties).map((p) => [p.id, fromProperty(p)])),
  };
}
