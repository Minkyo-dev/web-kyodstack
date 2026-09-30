import { z } from "zod";

// Public values are referenced statically so Next can inline them into client bundles.
const publicSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const publicEnv = publicSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:
    process.env.SUPABASE_PUBLISHABLE_KEY,
});
