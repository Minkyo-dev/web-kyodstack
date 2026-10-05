import { z } from "zod";

/** Notion ids are 8-4-4-4-12 hex but not always RFC-4122, so z.guid() rather than z.uuid(). */
export const createDatabaseSchema = z.object({ parentPageId: z.guid() });
export const noInputSchema = z.object({});
