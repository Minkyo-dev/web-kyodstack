import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

const isDev = process.env.NODE_ENV === "development";

export async function requireAuth(redirectTo = "/private/login") {
  if (isDev) return null;
  const user = await getUser();
  if (!user) redirect(redirectTo);
  return user;
}

export async function requireAdmin() {
  if (isDev) return null;
  const user = await requireAuth("/private/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user!.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) redirect("/");
  return user;
}
