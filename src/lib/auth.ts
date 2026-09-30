import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

export type AuthUser = { id: string; email: string | null };

/** Verified identity for the current request (JWT verified via getClaims). */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: (data.claims.email as string | undefined) ?? null,
  };
});

/** For pages/layouts: redirect anonymous users to /login. */
export async function requireUserOrRedirect(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** For Server Actions / services: throw a typed error instead of redirecting. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new AppError("AUTH_REQUIRED");
  return user;
}
