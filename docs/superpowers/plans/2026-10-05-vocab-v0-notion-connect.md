# 단어장 V0 — Notion connection and DB setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can connect their Notion workspace (public OAuth), pick a shared page, and have the app
create the "Kyod 단어장" database with the v1 schema. The new `/english` area shows the connection and can check
and repair the schema, reconnect and disconnect.

**Architecture:**
- `src/lib/notion` is a vendor boundary like `features/ai/services/provider.ts`. It holds the `NotionGateway`
  interface, an `@notionhq/client` implementation, a stateless-per-process fake for tests and E2E, error mapping,
  token encryption and OAuth `state` helpers. It knows nothing about vocabulary.
- `src/features/vocab` owns the schema definition (pure domain), the connection and setup services (Supabase +
  gateway), the actions and the UI.
- One table, `notion_connections`, stores encrypted tokens and the created DB's ids.

**Tech Stack:** Next.js 16.2 App Router (route handlers, Server Actions, RSC), Supabase (MCP migration workflow),
Zod 4, `@notionhq/client` 5.26.0 (pinned), Node `crypto` (AES-256-GCM), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-vocab-notion-design.md` (§3, §5, §11, §12, §14 V0). ADR draft:
`docs/decisions/0046-vocab-notion.md`.

**Deliberate refinements of the spec (recorded in Task 8):**
1. The gateway is **generic**: it has `createDatabase(properties)` instead of `createVocabDatabase`, because `lib`
   must not import a feature. The vocab schema lives in `features/vocab/domain/notion-schema.ts`.
2. **Tables arrive with the phase that uses them.** V0 creates only `notion_connections`. `vocab_words` and the rest
   come in V1+ with their RPCs and tests.
3. **429/5xx retries use the SDK's built-in `retry`** option (it honors `Retry-After`). The in-process throttle
   (spec §5.4) is deferred to V1, where bulk writes need it.
4. The connection stores **`database_url`**, so the UI can link to the DB without a Notion call.

## Global Constraints
- Pin new packages exactly: `@notionhq/client@5.26.0` (no `^`).
- Notion API version: `Notion-Version: 2026-03-11`, passed as `notionVersion`.
- Server-only env: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, `NOTION_TOKEN_KEY` (base64 of
  32 bytes) and `NOTION_GATEWAY` (`client` | `fake`; `fake` is refused when `NODE_ENV=production`). Nothing Notion
  uses a `SUPABASE_PUBLISHABLE_KEY`-style public prefix.
- Tokens are stored only as `v1:<iv>:<tag>:<ciphertext>` (base64 parts). They are never selected into a view type,
  never logged and never sent to the browser.
- Every mutation goes Zod → `requireUser` → service → `ActionResult` via `runAction`. `user_id` always comes from the
  session, including in the OAuth callback.
- Raw Notion errors never reach the browser. Map them to the `AppError` codes `NOTION_NOT_CONNECTED`,
  `NOTION_REAUTH_REQUIRED`, `NOTION_RATE_LIMITED`, `NOTION_UNAVAILABLE`, `NOTION_SCHEMA_MISMATCH` and
  `NOTION_ERROR`, or to `NOT_FOUND`.
- Notion ids from the client are validated with `z.guid()`. Notion ids are not always RFC-4122, so `z.uuid()` is too
  strict.
- The OAuth start link is a plain `<a href="/api/notion/connect">`, never `next/link`, because prefetching would hit
  the handler.
- UI: Korean labels, flat and dense, radius ≤ 8px, status never shown by color alone (icon + text).
- Migration workflow from `AGENTS.md`: apply via MCP → `list_migrations` → rename the file to the remote version →
  `generate_typescript_types` → RLS test via `execute_sql` → `get_advisors` (security).
- E2E data uses the `[e2e]` prefix and runs as the dedicated E2E user (ADR 0031).
- Stage explicit paths only. Never `git add -A`, because `package.json` has an unrelated local change (the dev port).
  When Task 3 changes `package.json`, stage only the dependency hunk (`git add -p package.json`).

## Review Focus
1. **The OAuth callback arrives with a missing, expired or forged `state`** (CSRF, or the 10-minute cookie
   expired). Expected: nothing is stored, and the browser lands on `/english/settings?error=oauth_state` with
   "연결 요청이 만료됐어요". Test: Task 6 `checkCallback`; Task 8 E2E "wrong state stores nothing".
2. **The user presses "Cancel" on Notion's consent screen** (`?error=access_denied`). Expected: nothing is stored,
   and the page reads "Notion 연결을 취소했어요". Test: Task 6 `checkCallback` + `connectErrorMessage`.
3. **The user reconnects to a different workspace.** Expected: the old DB ids are cleared and setup is shown again.
   Reconnecting to the same workspace keeps the DB. Test: Task 5 `grantKeepsDatabase`.
4. **The user shared no pages on the consent screen.** Expected: setup explains how to share a page and offers
   [다시 연결], with no create button. Test: Task 5 `setupState`; Task 7 manual browser check.
5. **A token was revoked in Notion (401) and there is no refresh token, or the refresh fails.** Expected: the
   connection flips to `reauth_required`, pages show the reconnect banner, nothing crashes. A deleted or retyped
   property shows up as a mismatch, and repair adds a uniquely named replacement. Test: Task 5 `callWithRefresh`;
   Task 2 `checkSchema`/`planRepair`.

---

### Task 1: Env, error codes and token encryption

**Files:**
- Modify: `src/lib/env.server.ts`
- Modify: `src/lib/errors.ts`
- Create: `src/lib/notion/token-crypto.ts`
- Test: `tests/unit/notion-crypto.test.ts`, `tests/unit/errors.test.ts` (add one case)

**Interfaces:**
- Produces:
  - `sealToken(plain: string, key: Buffer): string`
  - `openToken(sealed: string, key: Buffer): string` (throws on tamper or an unknown version)
  - the `ErrorCode` members `NOTION_NOT_CONNECTED | NOTION_REAUTH_REQUIRED | NOTION_RATE_LIMITED |
    NOTION_UNAVAILABLE | NOTION_SCHEMA_MISMATCH | NOTION_ERROR`
  - `serverEnv.NOTION_*`

- [ ] **Step 1: Write the failing tests**

`tests/unit/notion-crypto.test.ts`:
```ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "@/lib/notion/token-crypto";

const key = randomBytes(32);

describe("token crypto (ADR 0046)", () => {
  it("round-trips and never stores the plaintext", () => {
    const sealed = sealToken("secret_abc123", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("secret_abc123");
    expect(openToken(sealed, key)).toBe("secret_abc123");
  });

  it("uses a fresh IV every time", () => {
    expect(sealToken("same", key)).not.toBe(sealToken("same", key));
  });

  it("rejects tampering, a wrong key and unknown versions", () => {
    const [v, iv, tag, ct] = sealToken("secret", key).split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => openToken([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
    expect(() => openToken(sealToken("secret", key), randomBytes(32))).toThrow();
    expect(() => openToken(`v9:${iv}:${tag}:${ct}`, key)).toThrow("unsupported token format");
    expect(() => openToken("garbage", key)).toThrow("unsupported token format");
  });
});
```
Append to `tests/unit/errors.test.ts`:
```ts
describe("Notion error codes", () => {
  it("have user-facing Korean messages", () => {
    for (const code of ["NOTION_NOT_CONNECTED", "NOTION_REAUTH_REQUIRED", "NOTION_RATE_LIMITED", "NOTION_UNAVAILABLE", "NOTION_SCHEMA_MISMATCH", "NOTION_ERROR"] as const) {
      expect(new AppError(code).message).toMatch(/[가-힣]/);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/notion-crypto.test.ts tests/unit/errors.test.ts`
Expected: FAIL. The module `@/lib/notion/token-crypto` doesn't exist, and TS rejects the unknown error codes.

- [ ] **Step 3: Implement**

`src/lib/notion/token-crypto.ts`. This module is pure and has no `server-only` import, so unit tests can load it.
Only server code imports it.
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** AES-256-GCM with a random 12-byte IV. Output: "v1:<iv>:<tag>:<ciphertext>", each part base64 (ADR 0046). */
export function sealToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Throws when the value was tampered with, sealed with another key, or has an unknown version. */
export function openToken(sealed: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = sealed.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("unsupported token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
```
`src/lib/errors.ts`: add the six codes to `ERROR_CODES` (before `"INTERNAL_ERROR"`), and add to `DEFAULT_MESSAGES`:
```ts
  NOTION_NOT_CONNECTED: "Notion을 먼저 연결해 주세요.",
  NOTION_REAUTH_REQUIRED: "Notion 연결이 만료됐어요. 다시 연결해 주세요.",
  NOTION_RATE_LIMITED: "Notion이 잠시 바빠요. 잠시 후 다시 시도해 주세요.",
  NOTION_UNAVAILABLE: "Notion에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.",
  NOTION_SCHEMA_MISMATCH: "Notion 단어장의 속성이 바뀌었어요. 설정에서 속성을 복구해 주세요.",
  NOTION_ERROR: "Notion 요청을 처리하지 못했어요.",
```
`src/lib/env.server.ts`: add to `serverSchema`:
```ts
  /** Notion public integration (ADR 0046). */
  NOTION_CLIENT_ID: z.string().min(1).optional(),
  NOTION_CLIENT_SECRET: z.string().min(1).optional(),
  /** Must equal the redirect URI registered on the integration; defaults to <request origin>/api/notion/callback. */
  NOTION_REDIRECT_URI: z.url().optional(),
  /** base64 of 32 random bytes (`openssl rand -base64 32`); encrypts Notion tokens at rest. */
  NOTION_TOKEN_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "NOTION_TOKEN_KEY must be 32 bytes, base64")
    .optional(),
  /** "client" (default) or "fake" (tests/E2E; refused in production). */
  NOTION_GATEWAY: z.enum(["client", "fake"]).optional(),
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/notion-crypto.test.ts tests/unit/errors.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Add the local key**

Append a key to `.env.local` (git-ignored) so dev and E2E can seal tokens:
```bash
grep -q '^NOTION_TOKEN_KEY=' .env.local || echo "NOTION_TOKEN_KEY=$(openssl rand -base64 32)" >> .env.local
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/env.server.ts src/lib/errors.ts src/lib/notion/token-crypto.ts tests/unit/notion-crypto.test.ts tests/unit/errors.test.ts
git commit -m "Vocab V0: Notion env, error codes and AES-GCM token sealing"
```

---

### Task 2: The vocabulary's Notion schema (pure domain)

**Files:**
- Create: `src/lib/notion/types.ts` (shared gateway types; needed here for `NotionPropertySpec`/`NotionPropertyInfo`)
- Create: `src/features/vocab/domain/notion-schema.ts`
- Test: `tests/unit/vocab-notion-schema.test.ts`

**Interfaces:**
- Produces (`src/lib/notion/types.ts`):
```ts
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
```
- Produces (`notion-schema.ts`):
  - `VOCAB_SCHEMA_VERSION = 1`, `VOCAB_DB_TITLE = "Kyod 단어장"`
  - `VOCAB_PROPERTIES`, `type VocabPropertyKey`, `type PropertyIds = Record<VocabPropertyKey, string>`
  - `parsePropertyIds(raw: unknown): PropertyIds | null`
  - `mapCreatedProperties(actual: NotionPropertyInfo[]): PropertyIds` (throws `NOTION_SCHEMA_MISMATCH`)
  - `type SchemaIssue = { key: VocabPropertyKey; name: string; problem: "missing" | "wrong_type" }`
  - `checkSchema(ids, actual): SchemaIssue[]`
  - `type RepairPlan = { key: VocabPropertyKey; spec: NotionPropertySpec }[]`
  - `planRepair(issues, actual): RepairPlan`
  - `applyRepair(ids, plan, after): PropertyIds`

- [ ] **Step 1: Write the failing test** `tests/unit/vocab-notion-schema.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  applyRepair, checkSchema, mapCreatedProperties, parsePropertyIds, planRepair, VOCAB_PROPERTIES, type PropertyIds,
} from "@/features/vocab/domain/notion-schema";
import type { NotionPropertyInfo } from "@/lib/notion/types";

const created: NotionPropertyInfo[] = VOCAB_PROPERTIES.map((p, i) => ({ id: p.type === "title" ? "title" : `id${i}`, name: p.name, type: p.type }));

describe("vocab Notion schema v1 (spec §5.3)", () => {
  it("defines the eleven properties with their Notion types", () => {
    expect(VOCAB_PROPERTIES.map((p) => [p.name, p.type])).toEqual([
      ["단어", "title"], ["뜻", "rich_text"], ["품사", "select"], ["발음", "rich_text"], ["예문", "rich_text"],
      ["유의어", "rich_text"], ["메모", "rich_text"], ["주제", "multi_select"], ["레벨", "select"], ["상태", "status"],
      ["다음 복습", "date"],
    ]);
    expect(VOCAB_PROPERTIES.find((p) => p.key === "status")).toMatchObject({ options: ["새 단어", "학습 중", "학습 완료"] });
    expect(VOCAB_PROPERTIES.find((p) => p.key === "cefr")).toMatchObject({ options: ["A1", "A2", "B1", "B2", "C1", "C2"] });
  });

  it("maps created properties to ids by name and type", () => {
    const ids = mapCreatedProperties(created);
    expect(ids.term).toBe("title");
    expect(ids.nextReview).toBe("id10");
  });

  it("refuses a created DB that lacks a property", () => {
    expect(() => mapCreatedProperties(created.filter((p) => p.name !== "상태"))).toThrow(expect.objectContaining({ code: "NOTION_SCHEMA_MISMATCH" }));
  });

  it("tracks properties by id, so a rename in Notion is not a problem", () => {
    const ids = mapCreatedProperties(created);
    const renamed = created.map((p) => (p.id === ids.meaning ? { ...p, name: "Meaning" } : p));
    expect(checkSchema(ids, renamed)).toEqual([]);
  });

  it("reports deleted and retyped properties", () => {
    const ids = mapCreatedProperties(created);
    const actual = created.filter((p) => p.id !== ids.meaning).map((p) => (p.id === ids.cefr ? { ...p, type: "rich_text" } : p));
    expect(checkSchema(ids, actual)).toEqual([
      { key: "meaning", name: "뜻", problem: "missing" },
      { key: "cefr", name: "레벨", problem: "wrong_type" },
    ]);
  });

  it("plans replacements with names that do not collide, then adopts their ids", () => {
    const ids = mapCreatedProperties(created);
    const actual = created.filter((p) => p.id !== ids.meaning).map((p) => (p.id === ids.cefr ? { ...p, type: "rich_text" } : p));
    const plan = planRepair(checkSchema(ids, actual), actual);
    expect(plan).toEqual([
      { key: "meaning", spec: { name: "뜻", type: "rich_text", options: undefined } },
      { key: "cefr", spec: { name: "레벨 2", type: "select", options: ["A1", "A2", "B1", "B2", "C1", "C2"] } },
    ]);
    const after = [...actual, { id: "new-meaning", name: "뜻", type: "rich_text" }, { id: "new-cefr", name: "레벨 2", type: "select" }];
    const next: PropertyIds = applyRepair(ids, plan, after);
    expect(next.meaning).toBe("new-meaning");
    expect(next.cefr).toBe("new-cefr");
    expect(checkSchema(next, after)).toEqual([]);
  });

  it("parses stored ids and rejects incomplete objects", () => {
    const ids = mapCreatedProperties(created);
    expect(parsePropertyIds(JSON.parse(JSON.stringify(ids)))).toEqual(ids);
    expect(parsePropertyIds({ term: "title" })).toBeNull();
    expect(parsePropertyIds(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/vocab-notion-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Write `src/lib/notion/types.ts` exactly as in **Interfaces** above. Then write
`src/features/vocab/domain/notion-schema.ts`:
```ts
import { AppError } from "@/lib/errors";
import type { NotionPropertyInfo, NotionPropertySpec } from "@/lib/notion/types";

/** The Notion DB the app creates (spec §5.3). Properties are tracked by id, so renames in Notion are harmless. */
export const VOCAB_SCHEMA_VERSION = 1;
export const VOCAB_DB_TITLE = "Kyod 단어장";
export const POS_OPTIONS = ["명사", "동사", "형용사", "부사", "구동사", "숙어", "기타"] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const STUDY_STATUSES = ["새 단어", "학습 중", "학습 완료"] as const;

export const VOCAB_PROPERTIES = [
  { key: "term", name: "단어", type: "title" },
  { key: "meaning", name: "뜻", type: "rich_text" },
  { key: "pos", name: "품사", type: "select", options: POS_OPTIONS },
  { key: "ipa", name: "발음", type: "rich_text" },
  { key: "example", name: "예문", type: "rich_text" },
  { key: "synonyms", name: "유의어", type: "rich_text" },
  { key: "note", name: "메모", type: "rich_text" },
  { key: "topics", name: "주제", type: "multi_select" },
  { key: "cefr", name: "레벨", type: "select", options: CEFR_LEVELS },
  { key: "status", name: "상태", type: "status", options: STUDY_STATUSES },
  { key: "nextReview", name: "다음 복습", type: "date" },
] as const satisfies readonly (NotionPropertySpec & { key: string })[];

export type VocabPropertyKey = (typeof VOCAB_PROPERTIES)[number]["key"];
export type PropertyIds = Record<VocabPropertyKey, string>;
export type SchemaIssue = { key: VocabPropertyKey; name: string; problem: "missing" | "wrong_type" };
export type RepairPlan = { key: VocabPropertyKey; spec: NotionPropertySpec }[];

function specFor(key: VocabPropertyKey) {
  return VOCAB_PROPERTIES.find((p) => p.key === key)!;
}

export function parsePropertyIds(raw: unknown): PropertyIds | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const ids = {} as PropertyIds;
  for (const { key } of VOCAB_PROPERTIES) {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) return null;
    ids[key] = value;
  }
  return ids;
}

export function mapCreatedProperties(actual: NotionPropertyInfo[]): PropertyIds {
  const ids = {} as PropertyIds;
  for (const spec of VOCAB_PROPERTIES) {
    const hit = actual.find((p) => p.name === spec.name && p.type === spec.type);
    if (!hit) throw new AppError("NOTION_SCHEMA_MISMATCH");
    ids[spec.key] = hit.id;
  }
  return ids;
}

export function checkSchema(ids: PropertyIds, actual: NotionPropertyInfo[]): SchemaIssue[] {
  return VOCAB_PROPERTIES.flatMap((spec): SchemaIssue[] => {
    const hit = actual.find((p) => p.id === ids[spec.key]);
    if (!hit) return [{ key: spec.key, name: spec.name, problem: "missing" }];
    if (hit.type !== spec.type) return [{ key: spec.key, name: spec.name, problem: "wrong_type" }];
    return [];
  });
}

/** One replacement per issue; a taken name gets " 2", " 3", … Title issues are skipped (a DB always has one title). */
export function planRepair(issues: SchemaIssue[], actual: NotionPropertyInfo[]): RepairPlan {
  const taken = new Set(actual.map((p) => p.name));
  return issues
    .filter((issue) => issue.key !== "term")
    .map((issue) => {
      const spec = specFor(issue.key);
      let name: string = spec.name;
      for (let n = 2; taken.has(name); n++) name = `${spec.name} ${n}`;
      taken.add(name);
      return { key: issue.key, spec: { name, type: spec.type, options: "options" in spec ? spec.options : undefined } };
    });
}

export function applyRepair(ids: PropertyIds, plan: RepairPlan, after: NotionPropertyInfo[]): PropertyIds {
  const next = { ...ids };
  for (const { key, spec } of plan) {
    const hit = after.find((p) => p.name === spec.name && p.type === spec.type);
    if (!hit) throw new AppError("NOTION_SCHEMA_MISMATCH");
    next[key] = hit.id;
  }
  return next;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run tests/unit/vocab-notion-schema.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/notion/types.ts src/features/vocab/domain/notion-schema.ts tests/unit/vocab-notion-schema.test.ts
git commit -m "Vocab V0: Notion gateway types and the v1 word-table schema (check, repair plan)"
```

---

### Task 3: Notion gateway (SDK client, fake, error mapping, factory)

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@notionhq/client` 5.26.0)
- Create: `src/lib/notion/errors.ts`, `src/lib/notion/mapping.ts`, `src/lib/notion/fake-gateway.ts`,
  `src/lib/notion/client-gateway.ts`, `src/lib/notion/index.ts`
- Test: `tests/unit/notion-gateway.test.ts`

**Interfaces:**
- Consumes: the types from Task 2 (`src/lib/notion/types.ts`), `AppError` and `serverEnv` from Task 1.
- Produces:
  - `toNotionAppError(error: unknown): AppError`
  - `describeNotionError(error: unknown): { status?: number; code?: string; name?: string }`
  - `toPropertyConfigs(specs): Record<string, Record<string, unknown>>`
  - `toPropertyInfos(props): NotionPropertyInfo[]`
  - `toPageRefs(results): NotionPageRef[]`
  - `toGrant(res): OAuthGrant`
  - `class FakeNotionGateway`, `FAKE_GRANT`, `FAKE_PARENT_PAGE`, `fakeNotionStore()`
  - `class ClientNotionGateway`, `NOTION_VERSION = "2026-03-11"`
  - from `@/lib/notion` (server-only): `getNotionGateway(): NotionGateway`, `notionTokenKey(): Buffer`,
    `notionRedirectUri(origin: string): string`

- [ ] **Step 1: Install the SDK, pinned**

Run: `npm install --save-exact @notionhq/client@5.26.0`
Expected: `package.json` gets `"@notionhq/client": "5.26.0"`.

- [ ] **Step 2: Write the failing test** `tests/unit/notion-gateway.test.ts`
```ts
import { APIErrorCode, APIResponseError, RequestTimeoutError, type SearchResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { describeNotionError, toNotionAppError } from "@/lib/notion/errors";
import { FAKE_GRANT, FAKE_PARENT_PAGE, FakeNotionGateway, fakeNotionStore } from "@/lib/notion/fake-gateway";
import { toGrant, toPageRefs, toPropertyConfigs, toPropertyInfos } from "@/lib/notion/mapping";

const api = (code: APIErrorCode, status: number) =>
  new APIResponseError({ code, status, message: "raw secret detail", headers: {}, rawBodyText: "", additional_data: undefined, request_id: undefined });

describe("toNotionAppError (spec §11)", () => {
  it.each([
    [APIErrorCode.Unauthorized, 401, "NOTION_REAUTH_REQUIRED"],
    [APIErrorCode.RateLimited, 429, "NOTION_RATE_LIMITED"],
    [APIErrorCode.ObjectNotFound, 404, "NOT_FOUND"],
    [APIErrorCode.RestrictedResource, 403, "NOT_FOUND"],
    [APIErrorCode.ServiceUnavailable, 503, "NOTION_UNAVAILABLE"],
    [APIErrorCode.InternalServerError, 500, "NOTION_UNAVAILABLE"],
    [APIErrorCode.ValidationError, 400, "NOTION_ERROR"],
  ])("maps %s to %s without leaking the message", (code, status, expected) => {
    const mapped = toNotionAppError(api(code, status));
    expect(mapped.code).toBe(expected);
    expect(mapped.message).not.toContain("raw secret detail");
  });

  it("treats timeouts and network failures as unavailable, keeps AppErrors, hides the rest", () => {
    expect(toNotionAppError(new RequestTimeoutError()).code).toBe("NOTION_UNAVAILABLE");
    expect(toNotionAppError(new TypeError("fetch failed")).code).toBe("NOTION_UNAVAILABLE");
    expect(toNotionAppError(new AppError("CONFLICT")).code).toBe("CONFLICT");
    expect(toNotionAppError(new Error("boom")).code).toBe("NOTION_ERROR");
  });

  it("describes errors for logs with status and code only", () => {
    expect(describeNotionError(api(APIErrorCode.RateLimited, 429))).toEqual({ status: 429, code: "rate_limited", name: "APIResponseError" });
  });
});

describe("mapping", () => {
  it("builds property configs for every supported type", () => {
    expect(
      toPropertyConfigs([
        { name: "단어", type: "title" },
        { name: "레벨", type: "select", options: ["A1", "B1"] },
        { name: "주제", type: "multi_select" },
        { name: "상태", type: "status", options: ["새 단어"] },
        { name: "다음 복습", type: "date" },
        { name: "뜻", type: "rich_text" },
      ]),
    ).toEqual({
      단어: { title: {} },
      레벨: { select: { options: [{ name: "A1" }, { name: "B1" }] } },
      주제: { multi_select: { options: [] } },
      상태: { status: { options: [{ name: "새 단어" }] } },
      "다음 복습": { date: {} },
      뜻: { rich_text: {} },
    });
  });

  it("reads property infos", () => {
    expect(toPropertyInfos({ 단어: { id: "title", name: "단어", type: "title", title: {}, description: null } } as never)).toEqual([
      { id: "title", name: "단어", type: "title" },
    ]);
  });

  it("keeps only real pages that can be a parent, with their titles", () => {
    const page = (id: string, parentType: string, title: string, inTrash = false) => ({
      object: "page", id, url: `https://www.notion.so/${id}`, in_trash: inTrash, parent: { type: parentType },
      properties: { title: { id: "title", type: "title", title: title ? [{ plain_text: title }] : [] } },
    });
    const results = [
      page("p1", "workspace", "Study"),
      page("p2", "page_id", ""),
      page("row", "data_source_id", "A word row"),
      page("trash", "page_id", "Old", true),
      { object: "data_source", id: "ds" },
    ] as unknown as SearchResponse["results"];
    expect(toPageRefs(results)).toEqual([
      { id: "p1", title: "Study", url: "https://www.notion.so/p1" },
      { id: "p2", title: "제목 없음", url: "https://www.notion.so/p2" },
    ]);
  });

  it("turns a token response into a grant", () => {
    expect(toGrant({ access_token: "a", refresh_token: null, workspace_id: "w", workspace_name: "W", bot_id: "b" })).toEqual({
      accessToken: "a", refreshToken: null, workspaceId: "w", workspaceName: "W", botId: "b",
    });
  });
});

describe("FakeNotionGateway", () => {
  const gw = new FakeNotionGateway();
  const auth = { accessToken: FAKE_GRANT.accessToken };

  it("sends the browser straight back to the callback with the state", () => {
    const url = new URL(gw.authorizeUrl("st4te", "http://localhost:3100/api/notion/callback"));
    expect(url.pathname).toBe("/api/notion/callback");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("code")).toBe("fake-code");
  });

  it("exchanges only its own code and checks the token", async () => {
    await expect(gw.exchangeCode("fake-code", "x")).resolves.toEqual(FAKE_GRANT);
    await expect(gw.exchangeCode("other", "x")).rejects.toMatchObject({ code: "NOTION_ERROR" });
    await expect(gw.searchPages({ accessToken: "stale" })).rejects.toMatchObject({ code: "NOTION_REAUTH_REQUIRED" });
    await expect(gw.searchPages(auth)).resolves.toEqual([FAKE_PARENT_PAGE]);
  });

  it("creates, reads and extends a data source", async () => {
    const db = await gw.createDatabase(auth, { parentPageId: FAKE_PARENT_PAGE.id, title: "T", properties: [{ name: "단어", type: "title" }, { name: "뜻", type: "rich_text" }] });
    expect(db.properties).toEqual([{ id: "title", name: "단어", type: "title" }, { id: "fake1", name: "뜻", type: "rich_text" }]);
    fakeNotionStore().set(db.dataSourceId, [db.properties[0]]); // simulate deleting 뜻 in Notion
    const after = await gw.addProperties(auth, db.dataSourceId, [{ name: "뜻", type: "rich_text" }]);
    expect(after.map((p) => p.name)).toEqual(["단어", "뜻"]);
    await expect(gw.getDataSourceProperties(auth, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gw.createDatabase(auth, { parentPageId: "other", title: "T", properties: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/unit/notion-gateway.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the pure parts**

`src/lib/notion/errors.ts`:
```ts
import { APIErrorCode, ClientErrorCode, isNotionClientError } from "@notionhq/client";
import { AppError } from "@/lib/errors";

/** Notion SDK error → AppError. The Notion message never reaches the user (spec §11). */
export function toNotionAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isNotionClientError(error)) {
    switch (error.code) {
      case APIErrorCode.Unauthorized:
        return new AppError("NOTION_REAUTH_REQUIRED");
      case APIErrorCode.RateLimited:
        return new AppError("NOTION_RATE_LIMITED");
      case APIErrorCode.ObjectNotFound:
      case APIErrorCode.RestrictedResource:
        return new AppError("NOT_FOUND", "Notion에서 찾을 수 없어요. 페이지가 공유돼 있는지 확인해 주세요.");
      case APIErrorCode.InternalServerError:
      case APIErrorCode.ServiceOverload:
      case APIErrorCode.ServiceUnavailable:
      case APIErrorCode.GatewayTimeout:
      case ClientErrorCode.RequestTimeout:
        return new AppError("NOTION_UNAVAILABLE");
    }
    const status = (error as { status?: number }).status;
    if (status !== undefined && status >= 500) return new AppError("NOTION_UNAVAILABLE");
    return new AppError("NOTION_ERROR");
  }
  if (error instanceof TypeError) return new AppError("NOTION_UNAVAILABLE"); // fetch failed: DNS, reset, offline
  return new AppError("NOTION_ERROR");
}

/** Log-safe description: status, Notion code and class name. Never the message or body. */
export function describeNotionError(error: unknown): { status?: number; code?: string; name?: string } {
  if (isNotionClientError(error)) {
    const status = (error as { status?: number }).status;
    return { ...(status !== undefined ? { status } : {}), code: error.code, name: error.name };
  }
  return { name: error instanceof Error ? error.name : typeof error };
}
```
`src/lib/notion/mapping.ts`:
```ts
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
```
`src/lib/notion/fake-gateway.ts`. It stores data in `globalThis` so the route-handler and server-action module
graphs of one dev server share it:
```ts
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

  async exchangeCode(code: string): Promise<OAuthGrant> {
    if (code !== "fake-code") throw new AppError("NOTION_ERROR");
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
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/notion-gateway.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement the SDK gateway and the factory** (server-only; covered by the type check here and by
the owner's live smoke test in Task 8)

`src/lib/notion/client-gateway.ts`:
```ts
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
```
`src/lib/notion/index.ts`:
```ts
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
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx vitest run tests/unit/notion-gateway.test.ts && npx eslint src/lib/notion`
Expected: no errors; tests PASS. If TS rejects a cast in `client-gateway.ts`, use `as unknown as <Type>` at that
cast only and note it in the commit.

- [ ] **Step 8: Commit**
```bash
git add src/lib/notion tests/unit/notion-gateway.test.ts package-lock.json
git add -p package.json   # stage only the @notionhq/client line
git commit -m "Vocab V0: NotionGateway (SDK client with retries, fake, error mapping)"
```

---

### Task 4: Database: `notion_connections`

**Files:**
- Create: `supabase/migrations/<remote version>_vocab_notion_connections.sql`
- Create: `supabase/tests/rls/vocab.sql`
- Modify: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces the table `public.notion_connections` with these columns:
  - `user_id` (PK → `profiles.id`), `status`
  - `workspace_id`, `workspace_name`, `bot_id`
  - `access_token_enc`, `refresh_token_enc`
  - `database_id`, `data_source_id`, `database_url`, `property_ids` (jsonb), `schema_version`
  - `last_pulled_at`, `last_reconciled_at`, `created_at`, `updated_at`

  RLS: own-row select/insert/update/delete. `anon` is revoked.

- [ ] **Step 1: Write the SQL test** `supabase/tests/rls/vocab.sql`
```sql
-- ADR 0046 V0: notion_connections is own-row only; an active row needs a token; anon has no access.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.notion_connections (user_id, access_token_enc, workspace_id)
values ('00000000-0000-4000-a000-00000000000b', 'v1:x:y:z', 'ws-b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.notion_connections) = 0, 'A cannot read B connection';
  update public.notion_connections set status = 'disconnected';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B connection';
  delete from public.notion_connections;
  get diagnostics n = row_count;
  assert n = 0, 'A cannot delete B connection';
  begin
    insert into public.notion_connections (user_id, access_token_enc) values ('00000000-0000-4000-a000-00000000000b', 'v1:a:b:c');
    assert false, 'A cannot insert for B';
  exception when insufficient_privilege then null; end;

  insert into public.notion_connections (user_id, access_token_enc, workspace_id) values ('00000000-0000-4000-a000-00000000000a', 'v1:a:b:c', 'ws-a');
  begin
    update public.notion_connections set access_token_enc = null;
    assert false, 'an active connection needs a token';
  exception when check_violation then null; end;
  begin
    update public.notion_connections set status = 'bogus';
    assert false, 'status check';
  exception when check_violation then null; end;
  begin
    update public.notion_connections set property_ids = '[]'::jsonb;
    assert false, 'property_ids is an object';
  exception when check_violation then null; end;
  update public.notion_connections set status = 'disconnected', access_token_enc = null, refresh_token_enc = null;
  get diagnostics n = row_count;
  assert n = 1, 'A disconnects own row';
  assert (select updated_at >= created_at from public.notion_connections), 'updated_at trigger';
end $$;

select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform count(*) from public.notion_connections; assert false, 'anon has no access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS vocab';
rollback;
```

- [ ] **Step 2: Run it before the migration and confirm it fails**

Run it with the Supabase MCP `execute_sql` (paste the file contents).
Expected: ERROR `relation "public.notion_connections" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261005000000_vocab_notion_connections.sql`. The
timestamp is a placeholder; Step 4 renames the file to the remote version.
```sql
-- ADR 0046: 단어장 V0 — one Notion connection per user. Tokens are AES-256-GCM ciphertext sealed by the server
-- (lib/notion/token-crypto); the key never reaches the database.
create table public.notion_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disconnected')),
  workspace_id text check (char_length(workspace_id) <= 100),
  workspace_name text check (char_length(workspace_name) <= 200),
  bot_id text check (char_length(bot_id) <= 100),
  access_token_enc text check (char_length(access_token_enc) <= 4000),
  refresh_token_enc text check (char_length(refresh_token_enc) <= 4000),
  database_id text check (char_length(database_id) <= 100),
  data_source_id text check (char_length(data_source_id) <= 100),
  database_url text check (char_length(database_url) <= 500),
  property_ids jsonb check (property_ids is null or jsonb_typeof(property_ids) = 'object'),
  schema_version smallint check (schema_version > 0),
  last_pulled_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_connections_active_has_token check (status <> 'active' or access_token_enc is not null)
);
alter table public.notion_connections enable row level security;
create policy notion_connections_select_own on public.notion_connections for select to authenticated using (user_id = (select auth.uid()));
create policy notion_connections_insert_own on public.notion_connections for insert to authenticated with check (user_id = (select auth.uid()));
create policy notion_connections_update_own on public.notion_connections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notion_connections_delete_own on public.notion_connections for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notion_connections from anon;
create trigger notion_connections_set_updated_at before update on public.notion_connections
  for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Apply it and sync the history**
  1. Apply it with the MCP `apply_migration`, name `vocab_notion_connections`, with the file body as the query.
  2. Run MCP `list_migrations`, find the version of `vocab_notion_connections`, and
     `git mv supabase/migrations/20261005000000_vocab_notion_connections.sql supabase/migrations/<version>_vocab_notion_connections.sql`.
  3. Run MCP `generate_typescript_types` and write the output to `src/types/database.ts`.

- [ ] **Step 5: Run the SQL test and the advisors**

Run `supabase/tests/rls/vocab.sql` with the MCP `execute_sql`.
Expected: the last row is `PASS vocab`.

Then run MCP `get_advisors` (type `security`).
Expected: no new warning that mentions `notion_connections`. Fix any that appears with a new migration.

- [ ] **Step 6: Type check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add supabase/migrations/*_vocab_notion_connections.sql supabase/tests/rls/vocab.sql src/types/database.ts
git commit -m "Vocab V0: notion_connections table (own-row RLS, encrypted tokens) + SQL test"
```

---

### Task 5: Connection rules and services

**Files:**
- Create: `src/features/vocab/domain/connection.ts` (pure)
- Create: `src/features/vocab/services/connection.service.ts`, `src/features/vocab/services/setup.service.ts`
- Create: `src/features/vocab/schemas/setup.schema.ts`
- Create: `src/features/vocab/actions/connection.actions.ts`
- Test: `tests/unit/vocab-connection.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `sealToken`, `openToken`
  - Task 2: `VOCAB_PROPERTIES`, `VOCAB_DB_TITLE`, `VOCAB_SCHEMA_VERSION`, `mapCreatedProperties`, `checkSchema`,
    `planRepair`, `applyRepair`, `parsePropertyIds`, `PropertyIds`, `SchemaIssue`
  - Task 3: `getNotionGateway`, `notionTokenKey`, `NotionGateway`, `NotionAuth`, `OAuthGrant`, `NotionPageRef`
  - Task 4: the table
- Produces:
  - pure:
    - `type ConnectionStatus = "active" | "reauth_required" | "disconnected"`
    - `type SetupState = "not_connected" | "reauth" | "pick_page" | "ready"`
    - `setupState(conn: { status: ConnectionStatus; databaseId: string | null } | null): SetupState`
    - `grantKeepsDatabase(existingWorkspaceId: string | null | undefined, grant: { workspaceId: string }): boolean`
    - `callWithRefresh<T>(opts: { accessToken: string; refreshToken: string | null; call: (token: string) => Promise<T>; refresh: (rt: string) => Promise<{ accessToken: string; refreshToken: string | null }>; onRefreshed: (fresh: { accessToken: string; refreshToken: string | null }) => Promise<void>; onReauthRequired: () => Promise<void> }): Promise<T>`
    - `connectErrorMessage(param: string | undefined): string | null`
  - services:
    - `type ConnectionView = { status: ConnectionStatus; workspaceName: string | null; databaseId: string | null; dataSourceId: string | null; databaseUrl: string | null; propertyIds: PropertyIds | null }`
    - `getConnectionView(supabase, userId): Promise<ConnectionView | null>`
    - `completeOAuth(ctx, code, redirectUri): Promise<void>`
    - `withNotion(ctx, fn)`
    - `disconnectNotion(ctx)`
    - `listParentPages(ctx): Promise<NotionPageRef[]>`
    - `createVocabDatabase(ctx, parentPageId): Promise<{ databaseUrl: string }>`
    - `type SchemaState = { state: "ok" } | { state: "mismatch"; issues: SchemaIssue[] } | { state: "missing_db" }`
    - `inspectSchema(ctx): Promise<SchemaState>`
    - `repairSchema(ctx): Promise<{ repaired: number }>`
    - `forgetDatabase(ctx): Promise<void>`
  - actions: `createVocabDatabaseAction`, `repairSchemaAction`, `forgetDatabaseAction`, `disconnectNotionAction`
    (all take `unknown` input and return `ActionResult`)

- [ ] **Step 1: Write the failing test** `tests/unit/vocab-connection.test.ts`
```ts
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { callWithRefresh, connectErrorMessage, grantKeepsDatabase, setupState } from "@/features/vocab/domain/connection";

const reauth = () => new AppError("NOTION_REAUTH_REQUIRED");

describe("setupState", () => {
  it("walks not connected → reauth → pick a page → ready", () => {
    expect(setupState(null)).toBe("not_connected");
    expect(setupState({ status: "disconnected", databaseId: "db" })).toBe("not_connected");
    expect(setupState({ status: "reauth_required", databaseId: "db" })).toBe("reauth");
    expect(setupState({ status: "active", databaseId: null })).toBe("pick_page");
    expect(setupState({ status: "active", databaseId: "db" })).toBe("ready");
  });
});

describe("grantKeepsDatabase", () => {
  it("keeps the DB only when reconnecting to the same workspace", () => {
    expect(grantKeepsDatabase("ws1", { workspaceId: "ws1" })).toBe(true);
    expect(grantKeepsDatabase("ws1", { workspaceId: "ws2" })).toBe(false);
    expect(grantKeepsDatabase(null, { workspaceId: "ws1" })).toBe(false);
    expect(grantKeepsDatabase(undefined, { workspaceId: "ws1" })).toBe(false);
  });
});

describe("callWithRefresh", () => {
  const base = () => ({ onRefreshed: vi.fn(async () => {}), onReauthRequired: vi.fn(async () => {}) });

  it("returns the first result when the token works", async () => {
    const h = base();
    const refresh = vi.fn();
    await expect(callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", call: async (t) => `ok:${t}`, refresh })).resolves.toBe("ok:a");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes once on 401, stores the new tokens and retries", async () => {
    const h = base();
    const call = vi.fn(async (t: string) => {
      if (t === "a") throw reauth();
      return `ok:${t}`;
    });
    const result = await callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", call, refresh: async () => ({ accessToken: "b", refreshToken: "r2" }) });
    expect(result).toBe("ok:b");
    expect(h.onRefreshed).toHaveBeenCalledWith({ accessToken: "b", refreshToken: "r2" });
    expect(h.onReauthRequired).not.toHaveBeenCalled();
  });

  it("marks reauth when there is no refresh token, the refresh fails, or the new token fails too", async () => {
    for (const opts of [
      { refreshToken: null, refresh: async () => ({ accessToken: "b", refreshToken: null }) },
      { refreshToken: "r", refresh: async () => { throw new AppError("NOTION_ERROR"); } },
      { refreshToken: "r", refresh: async () => ({ accessToken: "b", refreshToken: "r" }) },
    ]) {
      const h = base();
      await expect(callWithRefresh({ ...h, ...opts, accessToken: "a", call: async () => { throw reauth(); } })).rejects.toMatchObject({ code: "NOTION_REAUTH_REQUIRED" });
      expect(h.onReauthRequired).toHaveBeenCalledTimes(1);
    }
  });

  it("passes other errors through without refreshing", async () => {
    const h = base();
    const refresh = vi.fn();
    await expect(callWithRefresh({ ...h, accessToken: "a", refreshToken: "r", refresh, call: async () => { throw new AppError("NOTION_RATE_LIMITED"); } })).rejects.toMatchObject({ code: "NOTION_RATE_LIMITED" });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("connectErrorMessage", () => {
  it("explains OAuth outcomes and known codes; ignores anything else", () => {
    expect(connectErrorMessage("oauth_denied")).toBe("Notion 연결을 취소했어요.");
    expect(connectErrorMessage("oauth_state")).toBe("연결 요청이 만료됐어요. 다시 시도해 주세요.");
    expect(connectErrorMessage("oauth_code")).toBe("Notion이 연결 정보를 보내지 않았어요. 다시 시도해 주세요.");
    expect(connectErrorMessage("NOTION_UNAVAILABLE")).toBe(new AppError("NOTION_UNAVAILABLE").message);
    expect(connectErrorMessage("<script>")).toBeNull();
    expect(connectErrorMessage(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/vocab-connection.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure rules** `src/features/vocab/domain/connection.ts`
```ts
import { AppError, ERROR_CODES, type ErrorCode } from "@/lib/errors";

export type ConnectionStatus = "active" | "reauth_required" | "disconnected";
export type SetupState = "not_connected" | "reauth" | "pick_page" | "ready";
type Tokens = { accessToken: string; refreshToken: string | null };

export function setupState(conn: { status: ConnectionStatus; databaseId: string | null } | null): SetupState {
  if (!conn || conn.status === "disconnected") return "not_connected";
  if (conn.status === "reauth_required") return "reauth";
  return conn.databaseId ? "ready" : "pick_page";
}

/** A grant for the same workspace keeps the created DB; another workspace cannot reach it, so setup starts over. */
export function grantKeepsDatabase(existingWorkspaceId: string | null | undefined, grant: { workspaceId: string }): boolean {
  return !!existingWorkspaceId && existingWorkspaceId === grant.workspaceId;
}

const isReauth = (e: unknown) => e instanceof AppError && e.code === "NOTION_REAUTH_REQUIRED";

/** 401 → one refresh (when possible) → one retry. Anything that still fails marks the connection for reauth (spec §5.2). */
export async function callWithRefresh<T>(opts: {
  accessToken: string;
  refreshToken: string | null;
  call: (token: string) => Promise<T>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  onRefreshed: (fresh: Tokens) => Promise<void>;
  onReauthRequired: () => Promise<void>;
}): Promise<T> {
  try {
    return await opts.call(opts.accessToken);
  } catch (error) {
    if (!isReauth(error)) throw error;
    if (!opts.refreshToken) {
      await opts.onReauthRequired();
      throw error;
    }
    let fresh: Tokens;
    try {
      fresh = await opts.refresh(opts.refreshToken);
    } catch {
      await opts.onReauthRequired();
      throw new AppError("NOTION_REAUTH_REQUIRED");
    }
    await opts.onRefreshed(fresh);
    try {
      return await opts.call(fresh.accessToken);
    } catch (retryError) {
      if (isReauth(retryError)) await opts.onReauthRequired();
      throw retryError;
    }
  }
}

const OAUTH_MESSAGES: Record<string, string> = {
  oauth_denied: "Notion 연결을 취소했어요.",
  oauth_state: "연결 요청이 만료됐어요. 다시 시도해 주세요.",
  oauth_code: "Notion이 연결 정보를 보내지 않았어요. 다시 시도해 주세요.",
};

/** `?error=` on /english/settings → a safe message. Unknown values show nothing (the param is user-controlled). */
export function connectErrorMessage(param: string | undefined): string | null {
  if (!param) return null;
  if (OAUTH_MESSAGES[param]) return OAUTH_MESSAGES[param];
  return (ERROR_CODES as readonly string[]).includes(param) ? new AppError(param as ErrorCode).message : null;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run tests/unit/vocab-connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the services**

`src/features/vocab/services/connection.service.ts`:
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getNotionGateway, notionTokenKey } from "@/lib/notion";
import { openToken, sealToken } from "@/lib/notion/token-crypto";
import type { NotionAuth, NotionGateway, OAuthGrant } from "@/lib/notion/types";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { callWithRefresh, grantKeepsDatabase, type ConnectionStatus } from "../domain/connection";
import { parsePropertyIds, type PropertyIds } from "../domain/notion-schema";

export type ConnectionView = {
  status: ConnectionStatus;
  workspaceName: string | null;
  databaseId: string | null;
  dataSourceId: string | null;
  databaseUrl: string | null;
  propertyIds: PropertyIds | null;
};

/** Never includes token columns. */
const VIEW_COLUMNS = "status, workspace_name, database_id, data_source_id, database_url, property_ids";
const NO_DATABASE = { database_id: null, data_source_id: null, database_url: null, property_ids: null, schema_version: null };

type ViewRow = { status: string; workspace_name: string | null; database_id: string | null; data_source_id: string | null; database_url: string | null; property_ids: unknown };

function toView(row: ViewRow): ConnectionView {
  return {
    status: row.status as ConnectionStatus,
    workspaceName: row.workspace_name,
    databaseId: row.database_id,
    dataSourceId: row.data_source_id,
    databaseUrl: row.database_url,
    propertyIds: parsePropertyIds(row.property_ids),
  };
}

export async function getConnectionView(supabase: SupabaseServerClient, userId: string): Promise<ConnectionView | null> {
  const { data, error } = await supabase.from("notion_connections").select(VIEW_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw fromDbError(error);
  return data ? toView(data) : null;
}

/** OAuth callback: exchange the code, then store the sealed tokens for the session user. */
export async function completeOAuth(ctx: ActionContext, code: string, redirectUri: string): Promise<void> {
  const grant = await getNotionGateway().exchangeCode(code, redirectUri);
  await saveGrant(ctx, grant);
}

async function saveGrant(ctx: ActionContext, grant: OAuthGrant): Promise<void> {
  const { data: existing, error: readError } = await ctx.supabase
    .from("notion_connections").select("workspace_id").eq("user_id", ctx.user.id).maybeSingle();
  if (readError) throw fromDbError(readError);
  const key = notionTokenKey();
  const { error } = await ctx.supabase.from("notion_connections").upsert(
    {
      user_id: ctx.user.id,
      status: "active",
      workspace_id: grant.workspaceId,
      workspace_name: grant.workspaceName,
      bot_id: grant.botId,
      access_token_enc: sealToken(grant.accessToken, key),
      refresh_token_enc: grant.refreshToken ? sealToken(grant.refreshToken, key) : null,
      ...(grantKeepsDatabase(existing?.workspace_id, grant) ? {} : NO_DATABASE),
    },
    { onConflict: "user_id" },
  );
  if (error) throw fromDbError(error);
}

async function updateConnection(ctx: ActionContext, patch: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.supabase.from("notion_connections").update(patch).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

/** Runs `fn` with a working Notion token: decrypts, refreshes once on 401, and flags reauth when that fails. */
export async function withNotion<T>(ctx: ActionContext, fn: (gateway: NotionGateway, auth: NotionAuth, conn: ConnectionView) => Promise<T>): Promise<T> {
  // Spelled out (not built from VIEW_COLUMNS): supabase-js derives the row type from the literal select string.
  const { data: row, error } = await ctx.supabase
    .from("notion_connections")
    .select("status, workspace_name, database_id, data_source_id, database_url, property_ids, access_token_enc, refresh_token_enc")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!row || row.status === "disconnected" || !row.access_token_enc) throw new AppError("NOTION_NOT_CONNECTED");
  if (row.status === "reauth_required") throw new AppError("NOTION_REAUTH_REQUIRED");
  const key = notionTokenKey();
  const markReauth = () => updateConnection(ctx, { status: "reauth_required" });
  let accessToken: string;
  let refreshToken: string | null;
  try {
    accessToken = openToken(row.access_token_enc, key);
    refreshToken = row.refresh_token_enc ? openToken(row.refresh_token_enc, key) : null;
  } catch {
    log({ action: "notion.token.open", userId: ctx.user.id, success: false, errorCode: "NOTION_REAUTH_REQUIRED" });
    await markReauth();
    throw new AppError("NOTION_REAUTH_REQUIRED");
  }
  const gateway = getNotionGateway();
  const conn = toView(row);
  return callWithRefresh({
    accessToken,
    refreshToken,
    call: (token) => fn(gateway, { accessToken: token }, conn),
    refresh: (rt) => gateway.refresh(rt),
    onRefreshed: (fresh) =>
      updateConnection(ctx, {
        access_token_enc: sealToken(fresh.accessToken, key),
        refresh_token_enc: fresh.refreshToken ? sealToken(fresh.refreshToken, key) : row.refresh_token_enc,
      }),
    onReauthRequired: markReauth,
  });
}

/** Revokes on Notion's side when possible (best effort), then forgets the tokens. The DB ids stay for a reconnect. */
export async function disconnectNotion(ctx: ActionContext): Promise<void> {
  const { data: row, error } = await ctx.supabase.from("notion_connections").select("access_token_enc").eq("user_id", ctx.user.id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!row) return;
  if (row.access_token_enc) {
    try {
      await getNotionGateway().revoke(openToken(row.access_token_enc, notionTokenKey()));
    } catch (revokeError) {
      log({ action: "notion.revoke", userId: ctx.user.id, success: false, errorCode: revokeError instanceof AppError ? revokeError.code : "INTERNAL_ERROR" });
    }
  }
  await updateConnection(ctx, { status: "disconnected", access_token_enc: null, refresh_token_enc: null });
}

export async function forgetDatabase(ctx: ActionContext): Promise<void> {
  await updateConnection(ctx, NO_DATABASE);
}
```
`src/features/vocab/services/setup.service.ts`:
```ts
import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { NotionPageRef } from "@/lib/notion/types";
import {
  applyRepair, checkSchema, mapCreatedProperties, planRepair, VOCAB_DB_TITLE, VOCAB_PROPERTIES, VOCAB_SCHEMA_VERSION, type SchemaIssue,
} from "../domain/notion-schema";
import { getConnectionView, withNotion } from "./connection.service";

export type SchemaState = { state: "ok" } | { state: "mismatch"; issues: SchemaIssue[] } | { state: "missing_db" };

export function listParentPages(ctx: ActionContext): Promise<NotionPageRef[]> {
  return withNotion(ctx, (gateway, auth) => gateway.searchPages(auth));
}

/** Creates "Kyod 단어장" under a page the user shared (spec §5.2 step 3). One DB per connection. */
export async function createVocabDatabase(ctx: ActionContext, parentPageId: string): Promise<{ databaseUrl: string }> {
  const view = await getConnectionView(ctx.supabase, ctx.user.id);
  if (view?.databaseId) throw new AppError("CONFLICT", "이미 단어장이 연결돼 있어요.");
  return withNotion(ctx, async (gateway, auth) => {
    const shared = await gateway.searchPages(auth);
    if (!shared.some((p) => p.id === parentPageId)) throw new AppError("NOT_FOUND", "공유된 페이지 중에서 골라 주세요.");
    const db = await gateway.createDatabase(auth, { parentPageId, title: VOCAB_DB_TITLE, properties: VOCAB_PROPERTIES });
    const propertyIds = mapCreatedProperties(db.properties);
    const { error } = await ctx.supabase
      .from("notion_connections")
      .update({ database_id: db.databaseId, data_source_id: db.dataSourceId, database_url: db.url, property_ids: propertyIds, schema_version: VOCAB_SCHEMA_VERSION })
      .eq("user_id", ctx.user.id);
    if (error) throw fromDbError(error);
    return { databaseUrl: db.url };
  });
}

export function inspectSchema(ctx: ActionContext): Promise<SchemaState> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    if (!conn.dataSourceId || !conn.propertyIds) return { state: "missing_db" };
    try {
      const issues = checkSchema(conn.propertyIds, await gateway.getDataSourceProperties(auth, conn.dataSourceId));
      return issues.length ? { state: "mismatch", issues } : { state: "ok" };
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") return { state: "missing_db" };
      throw error;
    }
  });
}

/** Re-adds missing or retyped properties (uniquely named) and adopts their ids (spec §5.3). */
export function repairSchema(ctx: ActionContext): Promise<{ repaired: number }> {
  return withNotion(ctx, async (gateway, auth, conn) => {
    if (!conn.dataSourceId || !conn.propertyIds) throw new AppError("NOTION_NOT_CONNECTED");
    const actual = await gateway.getDataSourceProperties(auth, conn.dataSourceId);
    const plan = planRepair(checkSchema(conn.propertyIds, actual), actual);
    if (plan.length === 0) return { repaired: 0 };
    const after = await gateway.addProperties(auth, conn.dataSourceId, plan.map((p) => p.spec));
    const { error } = await ctx.supabase
      .from("notion_connections").update({ property_ids: applyRepair(conn.propertyIds, plan, after) }).eq("user_id", ctx.user.id);
    if (error) throw fromDbError(error);
    return { repaired: plan.length };
  });
}
```
`src/features/vocab/schemas/setup.schema.ts`:
```ts
import { z } from "zod";

/** Notion ids are 8-4-4-4-12 hex but not always RFC-4122, so z.guid() rather than z.uuid(). */
export const createDatabaseSchema = z.object({ parentPageId: z.guid() });
export const noInputSchema = z.object({});
```
`src/features/vocab/actions/connection.actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { createDatabaseSchema, noInputSchema } from "../schemas/setup.schema";
import { disconnectNotion, forgetDatabase } from "../services/connection.service";
import { createVocabDatabase, repairSchema } from "../services/setup.service";

const refreshEnglish = () => revalidatePath("/english", "layout");

export async function createVocabDatabaseAction(input: unknown) {
  return runAction("vocab.setup.create_db", createDatabaseSchema, input, async (data, ctx) => {
    const result = await createVocabDatabase(ctx, data.parentPageId);
    refreshEnglish();
    return result;
  });
}

export async function repairSchemaAction(input: unknown) {
  return runAction("vocab.setup.repair_schema", noInputSchema, input, async (_data, ctx) => {
    const result = await repairSchema(ctx);
    refreshEnglish();
    return result;
  });
}

export async function forgetDatabaseAction(input: unknown) {
  return runAction("vocab.setup.forget_db", noInputSchema, input, async (_data, ctx) => {
    await forgetDatabase(ctx);
    refreshEnglish();
  });
}

export async function disconnectNotionAction(input: unknown) {
  return runAction("vocab.connection.disconnect", noInputSchema, input, async (_data, ctx) => {
    await disconnectNotion(ctx);
    refreshEnglish();
  });
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run tests/unit/vocab-connection.test.ts && npx eslint src/features/vocab`
Expected: no errors, PASS. If the generated types make `property_ids: propertyIds` a type error (`Json`), cast
there with `as unknown as Json` (import `Json` from `@/types/database`) and nothing else.

- [ ] **Step 7: Commit**
```bash
git add src/features/vocab/domain/connection.ts src/features/vocab/services src/features/vocab/schemas src/features/vocab/actions tests/unit/vocab-connection.test.ts
git commit -m "Vocab V0: connection rules (refresh once, reauth), setup/schema services and actions"
```

---

### Task 6: OAuth routes

**Files:**
- Create: `src/lib/notion/oauth-state.ts`
- Create: `src/app/api/notion/connect/route.ts`, `src/app/api/notion/callback/route.ts`
- Test: `tests/unit/notion-oauth-state.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `getNotionGateway`, `notionRedirectUri`
  - Task 5: `completeOAuth`
  - existing: `getUser`, `createClient`, `log`, `AppError`
- Produces:
  - `OAUTH_STATE_COOKIE = "notion_oauth_state"`
  - `newOAuthState(): string`
  - `type CallbackCheck = { ok: true; code: string } | { ok: false; reason: "denied" | "state" | "code" }`
  - `checkCallback(input: { cookieState: string | undefined; queryState: string | null; code: string | null; error: string | null }): CallbackCheck`
  - `GET /api/notion/connect` → 307 to Notion (or to the callback under the fake)
  - `GET /api/notion/callback` → 307 to `/english/settings?setup=1` or `?error=<oauth_*|ErrorCode>`

- [ ] **Step 1: Write the failing test** `tests/unit/notion-oauth-state.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { checkCallback, newOAuthState } from "@/lib/notion/oauth-state";

describe("OAuth state (spec §5.2, §12)", () => {
  it("is long, url-safe and unique", () => {
    const a = newOAuthState();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newOAuthState()).not.toBe(a);
  });

  it("accepts only a matching cookie and query state with a code", () => {
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: "c", error: null })).toEqual({ ok: true, code: "c" });
  });

  it("rejects a missing, expired or forged state before anything else", () => {
    expect(checkCallback({ cookieState: undefined, queryState: "s1", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: null, code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: "s2", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: "s1", queryState: "s1-longer", code: "c", error: null })).toEqual({ ok: false, reason: "state" });
    expect(checkCallback({ cookieState: undefined, queryState: null, code: null, error: "access_denied" })).toEqual({ ok: false, reason: "state" });
  });

  it("reports a cancelled consent and a missing code", () => {
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: null, error: "access_denied" })).toEqual({ ok: false, reason: "denied" });
    expect(checkCallback({ cookieState: "s1", queryState: "s1", code: null, error: null })).toEqual({ ok: false, reason: "code" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/notion-oauth-state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/notion/oauth-state.ts`
```ts
import { randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "notion_oauth_state";

export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export type CallbackCheck = { ok: true; code: string } | { ok: false; reason: "denied" | "state" | "code" };

/** The state check comes first, so a forged callback can't even report a denial. Constant-time comparison. */
export function checkCallback(input: { cookieState: string | undefined; queryState: string | null; code: string | null; error: string | null }): CallbackCheck {
  if (!input.cookieState || !input.queryState) return { ok: false, reason: "state" };
  const expected = Buffer.from(input.cookieState);
  const actual = Buffer.from(input.queryState);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "state" };
  if (input.error) return { ok: false, reason: "denied" };
  if (!input.code) return { ok: false, reason: "code" };
  return { ok: true, code: input.code };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run tests/unit/notion-oauth-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route handlers**

Before writing them, read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (or
the route-handler doc in that folder) and `.../04-functions/next-response.md`. Confirm that `NextRequest.cookies`,
`NextResponse.redirect` and `response.cookies.set`/`delete` work as below in Next 16.

`src/app/api/notion/connect/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getNotionGateway, notionRedirectUri } from "@/lib/notion";
import { newOAuthState, OAUTH_STATE_COOKIE } from "@/lib/notion/oauth-state";

/** Starts Notion OAuth (spec §5.2). The state is bound to a short-lived httpOnly cookie scoped to /api/notion. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/english/settings", origin));
  try {
    const state = newOAuthState();
    const response = NextResponse.redirect(getNotionGateway().authorizeUrl(state, notionRedirectUri(origin)));
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/notion",
    });
    return response;
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log({ action: "notion.connect", userId: user.id, success: false, errorCode: code, detail: error instanceof AppError ? undefined : String(error) });
    return NextResponse.redirect(new URL(`/english/settings?error=${code}`, origin));
  }
}
```
`src/app/api/notion/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { notionRedirectUri } from "@/lib/notion";
import { checkCallback, OAUTH_STATE_COOKIE } from "@/lib/notion/oauth-state";
import { createClient } from "@/lib/supabase/server";
import { completeOAuth } from "@/features/vocab/services/connection.service";

/** Notion redirects here. The connection always belongs to the session user, never to anything in the URL. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/english/settings", origin));

  const params = request.nextUrl.searchParams;
  const check = checkCallback({
    cookieState: request.cookies.get(OAUTH_STATE_COOKIE)?.value,
    queryState: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
  });
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/notion" });
    return response;
  };

  const startedAt = Date.now();
  if (!check.ok) {
    log({ action: "notion.callback", userId: user.id, success: false, detail: { reason: check.reason } });
    return finish(`/english/settings?error=oauth_${check.reason}`);
  }
  try {
    await completeOAuth({ user, supabase: await createClient() }, check.code, notionRedirectUri(origin));
    log({ action: "notion.callback", userId: user.id, success: true, durationMs: Date.now() - startedAt });
    return finish("/english/settings?setup=1");
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    log({ action: "notion.callback", userId: user.id, success: false, errorCode: code, durationMs: Date.now() - startedAt, detail: error instanceof AppError ? undefined : String(error) });
    return finish(`/english/settings?error=${code}`);
  }
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/api/notion src/lib/notion && npx vitest run tests/unit/notion-oauth-state.test.ts`
Expected: no errors, PASS.

- [ ] **Step 7: Commit**
```bash
git add src/lib/notion/oauth-state.ts src/app/api/notion tests/unit/notion-oauth-state.test.ts
git commit -m "Vocab V0: Notion OAuth connect/callback with a cookie-bound state"
```

---

### Task 7: `/english` shell, settings and navigation

**Files:**
- Modify: `src/components/layout/private-nav.tsx` (add 단어장)
- Modify: `src/app/(private)/dashboard/page.tsx` (add the tool card)
- Modify: `src/lib/page-help.ts`, `tests/unit/page-help.test.ts` (add the `english` key)
- Create: `src/features/vocab/components/english-nav.tsx`, `connect-card.tsx`, `reauth-banner.tsx`,
  `database-setup.tsx`, `connection-panel.tsx`
- Create: `src/app/(private)/english/layout.tsx`, `src/app/(private)/english/page.tsx`,
  `src/app/(private)/english/settings/page.tsx`

**Interfaces:**
- Consumes:
  - Task 5: `getConnectionView`, `listParentPages`, `inspectSchema`, `setupState`, `connectErrorMessage`, the four
    actions, `SchemaState`
  - Task 2: `NotionPageRef`
- Produces:
  - routes `/english`, `/english/settings` (`?setup=1`, `?error=`)
  - the page-help key `"english"`
  - E2E-visible labels: links "Notion 연결", "다시 연결", "Notion에서 열기"; buttons "단어장 만들기", "속성 복구",
    "새 단어장 만들기", "연결 해제", "해제 확인"; the text "속성 정상"; radio labels equal to page titles

- [ ] **Step 1: Write the failing page-help test change**

In `tests/unit/page-help.test.ts`, change the expected keys to
`["scheduler", "directive", "projects", "review", "progress", "finance", "english"]`.

Run: `npx vitest run tests/unit/page-help.test.ts`
Expected: FAIL (`english` is missing).

- [ ] **Step 2: Add the help text** in `src/lib/page-help.ts`

Add `"english"` to `PAGE_HELP_KEYS`, and this case to `pageHelp`:
```ts
    case "english":
      return {
        title: "단어장",
        concept:
          "내 Notion 데이터베이스를 단어장으로 씁니다. 단어 내용은 Notion에 저장되고, 복습 일정과 기록은 이 앱이 관리합니다. 학습 상태와 다음 복습일은 Notion에도 표시됩니다.",
        howTo: [
          "설정에서 'Notion 연결'을 누르고, Notion 화면에서 단어장을 둘 페이지를 골라 공유합니다.",
          "공유한 페이지 중 하나를 고르면 'Kyod 단어장' 데이터베이스가 그 아래에 만들어집니다.",
          "Notion에서 속성을 지우거나 유형을 바꿨다면 설정의 '속성 복구'로 되돌립니다. 이름만 바꾼 속성은 그대로 동작합니다.",
        ],
      };
```
Run: `npx vitest run tests/unit/page-help.test.ts`
Expected: PASS.

- [ ] **Step 3: Navigation and dashboard**

In `src/components/layout/private-nav.tsx`, import `BookOpenText` from `lucide-react` and append to `NAV`:
```ts
  { href: "/english", label: "단어장", icon: BookOpenText, exact: false },
```
In `src/app/(private)/dashboard/page.tsx`, import `BookOpenText` and append to `TOOLS`:
```ts
  { href: "/english", title: "단어장", body: "Notion 단어 → 복습 → AI 연습", icon: BookOpenText },
```

- [ ] **Step 4: Components**

`src/features/vocab/components/english-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 단어장 tabs. Later phases add 단어 · 복습 · AI 연습 · 통계 (spec §10). */
const TABS = [
  { href: "/english", label: "홈", exact: true },
  { href: "/english/settings", label: "설정", exact: false },
] as const;

export function EnglishNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="단어장" className="flex h-full gap-0.5 overflow-x-auto overflow-y-hidden sm:gap-1">
      {TABS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
              active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```
`src/features/vocab/components/connect-card.tsx` (server component):
```tsx
import { BookOpenText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

/** First visit: what connecting does. A plain <a>: the route handler redirects to Notion (no prefetch). */
export function ConnectCard() {
  return (
    <section className="max-w-xl space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <BookOpenText className="size-5 text-primary" aria-hidden />
        <h2 className="font-semibold">Notion을 단어장으로 쓰기</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Notion 계정을 연결하고 페이지 하나를 공유하면, 그 아래에 단어장 데이터베이스를 만들어 드려요. 단어는 Notion과 이 앱 어디서
        고쳐도 함께 반영됩니다.
      </p>
      <a href="/api/notion/connect" className={buttonVariants()}>
        Notion 연결
      </a>
    </section>
  );
}
```
`src/features/vocab/components/reauth-banner.tsx`:
```tsx
import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

export function ReauthBanner() {
  return (
    <div role="alert" className="flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Notion 연결이 만료됐어요. 단어 내용을 고치려면 다시 연결해 주세요.</span>
      <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
        다시 연결
      </a>
    </div>
  );
}
```
`src/features/vocab/components/database-setup.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { NotionPageRef } from "@/lib/notion/types";
import { createVocabDatabaseAction } from "../actions/connection.actions";

/** Step 3 of setup (spec §5.2): pick one of the shared pages; the DB is created under it. */
export function DatabaseSetup({ pages }: { pages: NotionPageRef[] | "error" }) {
  const { run, pending } = useActionRunner();
  const [selected, setSelected] = useState<string | null>(null);

  if (pages === "error") {
    return <p role="alert" className="text-sm text-muted-foreground">공유된 페이지를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (pages.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <p>공유된 페이지가 없어요.</p>
        <p className="text-muted-foreground">
          [다시 연결]을 누르고 Notion 화면에서 단어장을 둘 페이지를 선택해 주세요. 이미 연결했다면 Notion에서 그 페이지의 ••• → 연결 → Kyod를
          추가해도 됩니다.
        </p>
        <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
          다시 연결
        </a>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) run(() => createVocabDatabaseAction({ parentPageId: selected }), { success: "단어장을 만들었어요." });
      }}
    >
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">단어장을 만들 페이지</legend>
        {pages.map((page) => (
          <label key={page.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-accent/40">
            <input type="radio" name="parentPageId" value={page.id} checked={selected === page.id} onChange={() => setSelected(page.id)} />
            {page.title}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={!selected || pending}>
        단어장 만들기
      </Button>
    </form>
  );
}
```
`src/features/vocab/components/connection-panel.tsx`:
```tsx
"use client";

import { useState } from "react";
import { CircleCheck, CircleHelp, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { SchemaState } from "../services/setup.service";
import { disconnectNotionAction, forgetDatabaseAction, repairSchemaAction } from "../actions/connection.actions";

const PROBLEM: Record<"missing" | "wrong_type", string> = { missing: "삭제됨", wrong_type: "유형 바뀜" };

/** Ready state: the DB link, the schema check, reconnect and disconnect (spec §10 설정). */
export function ConnectionPanel({ workspaceName, databaseUrl, schema }: { workspaceName: string | null; databaseUrl: string | null; schema: SchemaState | "unknown" }) {
  const { run, pending } = useActionRunner();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">워크스페이스</dt>
        <dd>{workspaceName ?? "이름 없음"}</dd>
        <dt className="text-muted-foreground">단어장</dt>
        <dd>
          {databaseUrl && (
            <a href={databaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Notion에서 열기
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </dd>
        <dt className="text-muted-foreground">속성</dt>
        <dd className="space-y-2">
          {schema === "unknown" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CircleHelp className="size-4" aria-hidden />
              지금은 Notion 상태를 확인할 수 없어요
            </span>
          )}
          {schema !== "unknown" && schema.state === "ok" && (
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-4 text-primary" aria-hidden />
              속성 정상
            </span>
          )}
          {schema !== "unknown" && schema.state === "mismatch" && (
            <>
              <p className="inline-flex items-center gap-1">
                <TriangleAlert className="size-4" aria-hidden />
                바뀐 속성: {schema.issues.map((i) => `${i.name}(${PROBLEM[i.problem]})`).join(", ")}
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => repairSchemaAction({}), { success: "속성을 복구했어요." })}>
                속성 복구
              </Button>
            </>
          )}
          {schema !== "unknown" && schema.state === "missing_db" && (
            <>
              <p className="inline-flex items-center gap-1">
                <TriangleAlert className="size-4" aria-hidden />
                Notion에서 단어장 DB를 찾을 수 없어요. 삭제됐거나 공유가 해제됐어요.
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => forgetDatabaseAction({}))}>
                새 단어장 만들기
              </Button>
            </>
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
          다시 연결
        </a>
        {confirming ? (
          <>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => disconnectNotionAction({}), { success: "Notion 연결을 해제했어요." })}>
              해제 확인
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              취소
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            연결 해제
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Pages**

`src/app/(private)/english/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { PageHelp } from "@/components/layout/page-help";
import { requireUserOrRedirect } from "@/lib/auth";
import { EnglishNav } from "@/features/vocab/components/english-nav";

export const metadata: Metadata = { title: "단어장", robots: { index: false } };

/** 단어장 shell (ADR 0046): title, help and tabs. */
export default async function EnglishLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return (
    <>
      <header className="border-b border-border px-2 pt-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 px-2 sm:px-0">
          <h1 className="text-lg font-semibold">단어장</h1>
          <PageHelp page="english" />
        </div>
        <div className="h-10">
          <EnglishNav />
        </div>
      </header>
      <div className="space-y-4 p-4 md:p-6">{children}</div>
    </>
  );
}
```
`src/app/(private)/english/page.tsx`:
```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ConnectCard } from "@/features/vocab/components/connect-card";
import { ReauthBanner } from "@/features/vocab/components/reauth-banner";
import { setupState } from "@/features/vocab/domain/connection";
import { getConnectionView } from "@/features/vocab/services/connection.service";

export default async function EnglishHomePage() {
  const user = await requireUserOrRedirect();
  const view = await getConnectionView(await createClient(), user.id);
  const state = setupState(view);

  if (state === "not_connected") return <ConnectCard />;
  if (state === "reauth") return <ReauthBanner />;
  if (state === "pick_page") {
    return (
      <section className="max-w-xl space-y-3 rounded-lg border bg-card p-5 text-sm">
        <p>Notion은 연결됐어요. 단어장 데이터베이스를 만들 페이지를 골라 주세요.</p>
        <Link href="/english/settings" className={buttonVariants()}>
          단어장 만들기
        </Link>
      </section>
    );
  }
  return (
    <section className="max-w-xl space-y-2 rounded-lg border bg-card p-5 text-sm">
      <h2 className="font-semibold">Notion 단어장</h2>
      <p className="text-muted-foreground">{view?.workspaceName ?? "Notion"}의 &lsquo;Kyod 단어장&rsquo;과 연결돼 있어요. 단어 목록과 복습은 다음 단계에서 이 화면에 표시됩니다.</p>
      {view?.databaseUrl && (
        <a href={view.databaseUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Notion에서 열기
          <ExternalLink aria-hidden />
        </a>
      )}
    </section>
  );
}
```
`src/app/(private)/english/settings/page.tsx`:
```tsx
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { NotionPageRef } from "@/lib/notion/types";
import { ConnectCard } from "@/features/vocab/components/connect-card";
import { ConnectionPanel } from "@/features/vocab/components/connection-panel";
import { DatabaseSetup } from "@/features/vocab/components/database-setup";
import { ReauthBanner } from "@/features/vocab/components/reauth-banner";
import { connectErrorMessage, setupState } from "@/features/vocab/domain/connection";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { inspectSchema, listParentPages, type SchemaState } from "@/features/vocab/services/setup.service";

export default async function EnglishSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; setup?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const ctx = { user, supabase };
  const { error } = await searchParams;
  const errorMessage = connectErrorMessage(error);
  const view = await getConnectionView(supabase, user.id);
  const state = setupState(view);

  let pages: NotionPageRef[] | "error" = [];
  if (state === "pick_page") pages = await listParentPages(ctx).catch(() => "error" as const);
  let schema: SchemaState | "unknown" = "unknown";
  if (state === "ready") schema = await inspectSchema(ctx).catch(() => "unknown" as const);

  return (
    <div className="max-w-xl space-y-4">
      {errorMessage && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {errorMessage}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Notion 연결</h2>
        {state === "not_connected" && <ConnectCard />}
        {state === "reauth" && <ReauthBanner />}
        {state === "pick_page" && (
          <div className="space-y-3 rounded-lg border bg-card p-5">
            <p className="text-sm">
              <span className="text-muted-foreground">워크스페이스</span> {view?.workspaceName ?? "이름 없음"}
            </p>
            <DatabaseSetup pages={pages} />
          </div>
        )}
        {state === "ready" && (
          <div className="rounded-lg border bg-card p-5">
            <ConnectionPanel workspaceName={view?.workspaceName ?? null} databaseUrl={view?.databaseUrl ?? null} schema={schema} />
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify the build and the browser**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`
Expected: all pass.

Then start a fake-mode dev server on a free port. Next allows one dev server per project, so stop any other one
first:
```bash
NOTION_GATEWAY=fake npx next dev -p 3100
```
Check in the browser (next-devtools `browser_eval` or the Playwright MCP), signed in as the E2E user:
1. `/english` shows "Notion 연결".
2. Clicking it lands on `/english/settings?setup=1` with "[e2e] Fake workspace" and the radio "[e2e] 공유 페이지".
3. Choose it, then [단어장 만들기] → a toast, and the panel shows "속성 정상" and "Notion에서 열기".
4. `/english/settings?error=oauth_denied` shows "Notion 연결을 취소했어요.", and `?error=<script>` shows nothing.
5. The no-pages empty state cannot be reached with the fake. Check it by temporarily rendering
   `<DatabaseSetup pages={[]} />` locally, then revert.
6. At 390 px width there is no horizontal scroll.
7. [연결 해제] → [해제 확인] → back to "Notion 연결".
8. The sidebar shows "단어장", and the dashboard shows its card.

- [ ] **Step 7: Commit**
```bash
git add src/components/layout/private-nav.tsx "src/app/(private)/dashboard/page.tsx" src/lib/page-help.ts tests/unit/page-help.test.ts src/features/vocab/components "src/app/(private)/english"
git commit -m "Vocab V0: /english shell, settings (connect, create DB, schema check/repair, disconnect), nav"
```

---

### Task 8: E2E, docs and ADR

**Files:**
- Create: `tests/e2e/vocab-connect.spec.ts`
- Modify: `playwright.config.ts` (webServer env `NOTION_GATEWAY=fake`)
- Modify: `docs/architecture.md`, `docs/operations.md`, `docs/decisions/0046-vocab-notion.md`,
  `docs/decisions/README.md`, `docs/progress.md`, `docs/superpowers/specs/2026-10-05-vocab-notion-design.md`

**Interfaces:**
- Consumes: everything above. `dbAsUser`, `login` from `tests/e2e/helpers.ts`.

- [ ] **Step 1: Run the E2E server in fake mode**

In `playwright.config.ts`, add `env` to the `webServer` object. Playwright merges it over `process.env`:
```ts
        env: { NOTION_GATEWAY: "fake" },
```

- [ ] **Step 2: Write the spec** `tests/e2e/vocab-connect.spec.ts`
```ts
import { expect, test } from "@playwright/test";
import { dbAsUser, login } from "./helpers";

/** ADR 0046 V0 against the fake Notion gateway. The real OAuth is checked by hand (docs/operations.md). */
test.skip(!!process.env.E2E_BASE_URL && process.env.NOTION_GATEWAY !== "fake", "needs a dev server started with NOTION_GATEWAY=fake");

async function clearConnection() {
  const db = await dbAsUser();
  const { error } = await db.from("notion_connections").delete().not("user_id", "is", null);
  if (error) throw error;
}

test.beforeEach(clearConnection);
test.afterAll(clearConnection);

test("connect Notion, create the word DB, then disconnect", async ({ page }) => {
  await login(page);
  await page.goto("/english");
  await page.getByRole("link", { name: "Notion 연결" }).click();
  await expect(page).toHaveURL(/\/english\/settings\?setup=1/);
  await expect(page.getByText("[e2e] Fake workspace")).toBeVisible();

  await page.getByLabel("[e2e] 공유 페이지").check();
  await page.getByRole("button", { name: "단어장 만들기" }).click();
  await expect(page.getByText("속성 정상")).toBeVisible();
  await expect(page.getByRole("link", { name: "Notion에서 열기" })).toHaveAttribute("href", /notion\.so/);

  const db = await dbAsUser();
  const { data } = await db.from("notion_connections").select("status, database_id, access_token_enc").single();
  expect(data?.status).toBe("active");
  expect(data?.database_id).toBeTruthy();
  expect(data?.access_token_enc).toMatch(/^v1:/);
  expect(data?.access_token_enc).not.toContain("fake-access");

  await page.goto("/english");
  await expect(page.getByRole("link", { name: "Notion에서 열기" })).toBeVisible();

  await page.goto("/english/settings");
  await page.getByRole("button", { name: "연결 해제" }).click();
  await page.getByRole("button", { name: "해제 확인" }).click();
  await expect(page.getByRole("link", { name: "Notion 연결" })).toBeVisible();
});

test("a callback with a forged state stores nothing", async ({ page }) => {
  await login(page);
  await page.goto("/api/notion/callback?code=fake-code&state=forged");
  await expect(page).toHaveURL(/\/english\/settings\?error=oauth_state/);
  await expect(page.getByRole("alert")).toContainText("만료");
  const db = await dbAsUser();
  const { data } = await db.from("notion_connections").select("user_id");
  expect(data).toEqual([]);
});
```

- [ ] **Step 3: Run it**

Run: `set -a; source .env.local; set +a; npx playwright test tests/e2e/vocab-connect.spec.ts`
Expected: 2 passed. The suite is env-flaky (see memory), so re-run a failing spec alone before you debug it.

- [ ] **Step 4: Run the full verification**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`
Then run the whole E2E suite once: `set -a; source .env.local; set +a; npm run test:e2e`
Expected: all green. Re-run any failing spec alone before you treat it as a regression.

- [ ] **Step 5: Docs**
- `docs/architecture.md`:
  - Routes table: add `/english` (home: connect, reauth or DB link), `/english/settings?setup&error` (connection,
    DB creation, schema check/repair, disconnect) and `GET /api/notion/{connect,callback}` (OAuth, cookie-bound
    state).
  - Modules table: add `src/lib/notion` (`NotionGateway` + SDK client with retries + fake, `token-crypto`,
    `oauth-state`, `errors`, `mapping`; the factory in `index.ts`) and `src/features/vocab` (`domain/notion-schema`,
    `domain/connection`, `services/{connection,setup}.service`, `actions/connection.actions`, components).
- `docs/operations.md` §1 (env vars): add `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`,
  `NOTION_TOKEN_KEY` (`openssl rand -base64 32`; rotating it means every user reconnects, because old ciphertexts
  stop opening and flip to 다시 연결) and `NOTION_GATEWAY` (dev/E2E only).
- `docs/operations.md`: add a section "Notion integration (단어장)" with these steps:
  1. notion.so/profile/integrations → New integration → type **Public**.
  2. Add the redirect URIs `https://<prod-host>/api/notion/callback` and `http://localhost:3001/api/notion/callback`.
  3. Fill in the website, privacy and terms URLs if Notion asks for them.
  4. Copy the client id and secret into the Vercel env and `.env.local`.
  5. **Smoke test once per environment:** connect → the shared page shows up → [단어장 만들기] → in Notion, check
     the DB has the 11 properties and 상태 has 새 단어/학습 중/학습 완료 → record whether Notion returned a
     `refresh_token` (spec §15) in ADR 0046.
- `docs/operations.md` §5: E2E starts its server with `NOTION_GATEWAY=fake`. Against an external server
  (`E2E_BASE_URL`), the vocab spec is skipped unless that server runs with the fake.
- `docs/decisions/0046-vocab-notion.md`: set `Status: accepted (V0 implemented 2026-10-05)`. Under Decision, add a
  "V0 refinements" list with the four refinements from this plan's header (generic gateway, tables per phase, SDK
  retry, `database_url`). Set the README row to `accepted`.
- Spec `docs/superpowers/specs/2026-10-05-vocab-notion-design.md`:
  - Replace the §5.4 interface block with the generic `NotionGateway` from Task 2. Keep a note that the
    word-page methods (`queryPages`, `createPage`, `updatePage`, `trashPage`) arrive in V1.
  - In §14, change the V0 row's "migration `vocab_core` (all tables, RLS, RPCs)" to "migration
    `vocab_notion_connections`; later tables and RPCs arrive with their phase".
- `docs/progress.md`: check the V0 box, adding "(E2E `vocab-connect.spec.ts`, SQL `supabase/tests/rls/vocab.sql`)".

- [ ] **Step 6: Commit**
```bash
git add tests/e2e/vocab-connect.spec.ts playwright.config.ts docs/architecture.md docs/operations.md docs/decisions/0046-vocab-notion.md docs/decisions/README.md docs/progress.md docs/superpowers/specs/2026-10-05-vocab-notion-design.md
git commit -m "Vocab V0: E2E (fake Notion), docs, ADR 0046 accepted"
```
