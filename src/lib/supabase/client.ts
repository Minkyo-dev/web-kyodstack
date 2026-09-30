import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_PUBLISHABLE_KEY,
  );
}
