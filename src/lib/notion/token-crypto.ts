import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";

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

/**
 * NOTION_TOKEN_KEY → 32-byte key. Checked where it is used (not in the global env parse), so a wrong value only
 * breaks the Notion features, with a message that says what to fix.
 */
export function parseTokenKey(raw: string | undefined): Buffer {
  if (!raw) throw new AppError("NOTION_NOT_CONFIGURED", "NOTION_TOKEN_KEY가 없어요. `openssl rand -base64 32`로 만든 값을 넣어 주세요.");
  if (raw.startsWith("secret_") || raw.startsWith("ntn_")) {
    throw new AppError("NOTION_NOT_CONFIGURED", "NOTION_TOKEN_KEY에 Notion 시크릿이 들어 있어요. 시크릿은 NOTION_CLIENT_SECRET에 넣고, 이 값은 `openssl rand -base64 32`로 새로 만들어 주세요.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new AppError("NOTION_NOT_CONFIGURED", "NOTION_TOKEN_KEY는 32바이트 base64 값이어야 해요 (`openssl rand -base64 32`).");
  return key;
}
