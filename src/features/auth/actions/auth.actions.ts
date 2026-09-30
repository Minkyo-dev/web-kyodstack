"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import { loginSchema, safeNextPath } from "../schemas/login.schema";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    log({ action: "auth.login", success: false, errorCode: "AUTH_REQUIRED" });
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
