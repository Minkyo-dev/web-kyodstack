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
