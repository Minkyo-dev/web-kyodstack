"use server";

import { runAction } from "@/lib/action";
import { endpointSchema, emptySchema, notificationPrefsSchema, pushSubscriptionSchema } from "../schemas/proposal.schema";
import { loadNotificationSettings, removeSubscription, savePrefs, saveSubscription, sendTest } from "../services/subscription.service";

/** Web push (ADR 0043): this device on/off, preferences, and a test push. */
export async function subscribePushAction(input: unknown) {
  return runAction("assistant.push.subscribe", pushSubscriptionSchema, input, (d, ctx) => saveSubscription(ctx, d));
}
export async function unsubscribePushAction(input: unknown) {
  return runAction("assistant.push.unsubscribe", endpointSchema, input, (d, ctx) => removeSubscription(ctx, d.endpoint));
}
export async function saveNotificationPrefsAction(input: unknown) {
  return runAction("assistant.push.prefs", notificationPrefsSchema, input, (d, ctx) => savePrefs(ctx, d));
}
export async function sendTestPushAction(input: unknown = {}) {
  return runAction("assistant.push.test", emptySchema, input, (_d, ctx) => sendTest(ctx));
}
export async function loadNotificationSettingsAction(input: unknown = {}) {
  return runAction("assistant.push.load", emptySchema, input, (_d, ctx) => loadNotificationSettings(ctx));
}
