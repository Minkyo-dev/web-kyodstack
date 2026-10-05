import { z } from "zod";

export const proposalIdSchema = z.object({ proposalId: z.uuid() });
export type ProposalIdInput = z.infer<typeof proposalIdSchema>;

export const chatMessageSchema = z.object({ message: z.string().trim().min(1, "메시지를 입력해 주세요.").max(2000) });
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export const emptySchema = z.object({});

/** Web push (ADR 0043). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000).refine((u) => u.startsWith("https://"), "올바른 구독이 아닙니다."),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).nullable().default(null),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export const endpointSchema = z.object({ endpoint: z.url().max(2000) });
const hour = z.coerce.number().int().min(0).max(23);
export const notificationPrefsSchema = z.object({
  block_soon: z.boolean(),
  habit_missed: z.boolean(),
  checkin: z.boolean(),
  change_quiet: z.boolean(),
  vocab_due: z.boolean().default(true),
  quiet_start: hour,
  quiet_end: hour,
  daily_cap: z.coerce.number().int().min(1).max(10),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
