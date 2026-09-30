import "server-only";
import type { ErrorCode } from "@/lib/errors";

type LogFields = {
  action: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  durationMs?: number;
  success: boolean;
  errorCode?: ErrorCode;
  detail?: unknown;
};

/** Structured JSON log line (spec §48). Never pass tokens, keys, or full private notes. */
export function log(fields: LogFields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...fields });
  if (fields.success) console.info(line);
  else console.error(line);
}
