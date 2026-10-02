import "server-only";
import type { ActionContext } from "@/lib/action";
import { AppError, fromDbError } from "@/lib/errors";
import type { NotificationPrefsInput, PushSubscriptionInput } from "../schemas/proposal.schema";
import { DEFAULT_PREFS } from "../domain/notify";
import { deliver } from "./notify.service";
import { pushConfigured } from "./push.service";
import { serverEnv } from "@/lib/env.server";

/** Save this device; preferences are created with defaults on the first device (ADR 0043). */
export async function saveSubscription(ctx: ActionContext, input: PushSubscriptionInput): Promise<void> {
  if (!pushConfigured()) throw new AppError("INTERNAL_ERROR", "푸시 알림 키가 설정되지 않았습니다.");
  await ctx.supabase.from("push_subscriptions").delete().eq("user_id", ctx.user.id).eq("endpoint", input.endpoint);
  const { error } = await ctx.supabase.from("push_subscriptions").insert({
    user_id: ctx.user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: input.userAgent,
  });
  if (error) throw error.code === "23505" ? new AppError("CONFLICT", "이 기기는 다른 계정의 알림에 연결되어 있습니다.") : fromDbError(error);
  const prefs = await ctx.supabase.from("notification_prefs").upsert({ user_id: ctx.user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (prefs.error) throw fromDbError(prefs.error);
}

export async function removeSubscription(ctx: ActionContext, endpoint: string): Promise<void> {
  const { error } = await ctx.supabase.from("push_subscriptions").delete().eq("user_id", ctx.user.id).eq("endpoint", endpoint);
  if (error) throw fromDbError(error);
}

export async function savePrefs(ctx: ActionContext, input: NotificationPrefsInput): Promise<void> {
  const { error } = await ctx.supabase
    .from("notification_prefs")
    .upsert({ user_id: ctx.user.id, ...input, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw fromDbError(error);
}

/** [테스트 알림 보내기]: straight to this user's devices, bypassing rules and the log. Returns devices reached. */
export async function sendTest(ctx: ActionContext): Promise<{ reached: number; devices: number }> {
  const { data, error } = await ctx.supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
  if (data.length === 0) throw new AppError("VALIDATION_ERROR", "알림을 켠 기기가 없습니다.");
  const reached = await deliver(ctx.supabase, ctx.user.id, data, {
    title: "비서 알림 테스트",
    body: "이 기기에서 알림을 받을 수 있어요.",
    url: "/scheduler",
    dedupeKey: "test",
  });
  return { reached, devices: data.length };
}

export async function loadNotificationSettings(ctx: Pick<ActionContext, "supabase" | "user">) {
  const [prefs, subs] = await Promise.all([
    ctx.supabase.from("notification_prefs").select("*").eq("user_id", ctx.user.id).maybeSingle(),
    ctx.supabase.from("push_subscriptions").select("endpoint").eq("user_id", ctx.user.id),
  ]);
  if (prefs.error) throw fromDbError(prefs.error);
  if (subs.error) throw fromDbError(subs.error);
  const p = prefs.data;
  return {
    prefs: p
      ? { block_soon: p.block_soon, habit_missed: p.habit_missed, checkin: p.checkin, change_quiet: p.change_quiet, quiet_start: p.quiet_start, quiet_end: p.quiet_end, daily_cap: p.daily_cap }
      : DEFAULT_PREFS,
    endpoints: subs.data.map((s) => s.endpoint),
    /** The VAPID public key is public by design; null → push can't be enabled (keys not configured). */
    publicKey: pushConfigured() ? serverEnv.VAPID_PUBLIC_KEY! : null,
  };
}
