import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Service-role client for trusted background jobs ONLY (spec §20). It bypasses RLS,
 * so every query made with it must be scoped by user_id explicitly. Never import it
 * from a client component or from a request path that acts for the signed-in user.
 */
export function createAdminClient(): SupabaseServerClient {
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new AppError("INTERNAL_ERROR", "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const client = createClient<Database>(publicEnv.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Same query surface as the cookie-based server client; typed as such so the
  // existing (explicitly user-scoped) services can be reused.
  return client as unknown as SupabaseServerClient;
}
