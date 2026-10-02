import "server-only";
import webpush from "web-push";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "@/lib/errors";

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag: string };
export type PushResult = "sent" | "gone" | "failed";

let configured = false;
function configure() {
  if (configured) return;
  const pub = serverEnv.VAPID_PUBLIC_KEY;
  if (!pub || !serverEnv.VAPID_PRIVATE_KEY) throw new AppError("INTERNAL_ERROR", "푸시 알림 키가 설정되지 않았습니다.");
  webpush.setVapidDetails(serverEnv.VAPID_SUBJECT ?? "https://github.com/Minkyo-dev/web-kyodstack", pub, serverEnv.VAPID_PRIVATE_KEY);
  configured = true;
}

export function pushConfigured(): boolean {
  return !!serverEnv.VAPID_PUBLIC_KEY && !!serverEnv.VAPID_PRIVATE_KEY;
}

/** One device (ADR 0043): 404/410 means the subscription is gone and should be deleted by the caller. */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      { TTL: 60 * 30, urgency: "normal", topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
