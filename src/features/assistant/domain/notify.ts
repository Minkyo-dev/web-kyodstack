/**
 * Notification rules `notify-v2` (ADR 0043; v2 adds the 단어장 reminder `vocab_due`, ADR 0046). Pure and deterministic, in the owner's local time; the job gathers the
 * facts, this decides what (if anything) to send.
 */
import { TERMS } from "@/lib/terms";

export const NOTIFY_VERSION = "notify-v2";
export const NOTIFY_KINDS = ["block_soon", "checkin", "vocab_due", "habit_missed", "change_quiet"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export const BLOCK_SOON_MINUTES = 15;
export const QUIET_CHANGE_DAYS = 14;
const HABIT_HOUR = 8;
const QUIET_CHANGE_HOUR = 9;

export type NotifyPrefs = Record<NotifyKind, boolean> & { quiet_start: number; quiet_end: number; daily_cap: number };
export const DEFAULT_PREFS: NotifyPrefs = {
  block_soon: true,
  checkin: true,
  habit_missed: true,
  change_quiet: true,
  vocab_due: true,
  quiet_start: 22,
  quiet_end: 7,
  daily_cap: 4,
};

export type NotifyInput = {
  now: string;
  localDate: string;
  localHour: number;
  /** "HH:MM" local, for minute-precise reminders. */
  localTime: string;
  weekStart: string;
  eveningHour: number;
  prefs: NotifyPrefs;
  /** Non-test notifications already sent this local day. */
  sentToday: number;
  blocks: { id: string; startsAt: string; taskTitle: string; taskOpen: boolean; status: string }[];
  /** Habits due today that were due and unchecked yesterday. */
  missedHabits: string[];
  checkinDone: boolean;
  /** Any planned block or session today (no check-in nudge on an empty day). */
  dayHadActivity: boolean;
  /** Active changes with no focus session and no habit check in the last 14 days. */
  quietChanges: { id: string; title: string }[];
  /** Today's 단어장 queue and the user's reminder time; null without a word table or with the reminder off. */
  vocabDue: { reviews: number; newCards: number; reminderTime: string } | null;
};

export type Notification = { kind: NotifyKind; dedupeKey: string; title: string; body: string; url: string };

/** Quiet hours [start, end) in local hours; start === end means none; wraps past midnight. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What to send now, in priority order, within quiet hours, switches and the daily cap. */
export function selectNotifications(i: NotifyInput): Notification[] {
  if (inQuietHours(i.localHour, i.prefs.quiet_start, i.prefs.quiet_end)) return [];
  const room = i.prefs.daily_cap - i.sentToday;
  if (room <= 0) return [];
  const now = Date.parse(i.now);
  const out: Notification[] = [];

  if (i.prefs.block_soon) {
    const soon = i.blocks
      .filter((b) => b.status === "planned" && b.taskOpen)
      .map((b) => ({ ...b, minutes: Math.round((Date.parse(b.startsAt) - now) / 60_000) }))
      .filter((b) => b.minutes > 0 && b.minutes <= BLOCK_SOON_MINUTES)
      .sort((a, b) => a.minutes - b.minutes);
    for (const b of soon) {
      out.push({
        kind: "block_soon",
        dedupeKey: `block:${b.id}`,
        title: `${b.minutes}분 뒤: ${clip(b.taskTitle, 60)}`,
        body: "타이머를 켜고 시작해 보세요.",
        url: "/scheduler",
      });
    }
  }
  if (i.prefs.checkin && i.localHour >= i.eveningHour && !i.checkinDone && i.dayHadActivity) {
    out.push({
      kind: "checkin",
      dedupeKey: `checkin:${i.localDate}`,
      title: "하루 마무리 시간이에요",
      body: "잘한 한 가지와 내일의 한 가지를 정해 둘까요?",
      url: "/scheduler",
    });
  }
  if (i.prefs.vocab_due && i.vocabDue && i.localTime >= i.vocabDue.reminderTime && i.vocabDue.reviews + i.vocabDue.newCards > 0) {
    out.push({
      kind: "vocab_due",
      dedupeKey: `vocab:${i.localDate}`,
      title: `오늘 복습할 단어 ${i.vocabDue.reviews}개 · 새 단어 ${i.vocabDue.newCards}개`,
      body: "몇 분이면 끝나요. 지금 한 번 볼까요?",
      url: "/english/review",
    });
  }
  if (i.prefs.habit_missed && i.localHour >= HABIT_HOUR && i.missedHabits.length > 0) {
    out.push({
      kind: "habit_missed",
      dedupeKey: `habit:${i.localDate}`,
      title: `어제 놓친 ${TERMS.habit}: ${clip(i.missedHabits.join(", "), 60)}`,
      body: "오늘 하면 두 번 연속은 아니에요. 가장 작은 버전이라도 괜찮아요.",
      url: "/scheduler",
    });
  }
  if (i.prefs.change_quiet && i.localHour >= QUIET_CHANGE_HOUR) {
    for (const c of i.quietChanges) {
      out.push({
        kind: "change_quiet",
        dedupeKey: `quiet:${c.id}:${i.weekStart}`,
        title: `'${clip(c.title, 50)}'가 2주째 조용해요`,
        body: "가장 작은 다음 행동 하나만 정해 볼까요?",
        url: `/scheduler/directive?mission=${c.id}#mission-detail`,
      });
    }
  }
  return out.slice(0, room);
}
