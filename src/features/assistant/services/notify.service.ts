import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { focusStats } from "@/features/scheduler/utils/focus";
import { addLocalDays, localDayRange, localWeek, toLocalDate, toLocalTime } from "@/features/scheduler/utils/timezone";
import { isDueOn } from "@/features/direction/domain/habits";
import type { ArchivableStatus, HabitRule } from "@/features/direction/domain/direction.types";
import { OPEN_TASK_STATUSES } from "@/features/scheduler/domain/scheduler.constants";
import { BLOCK_SOON_MINUTES, DEFAULT_PREFS, QUIET_CHANGE_DAYS, selectNotifications, type Notification, type NotifyInput, type NotifyPrefs } from "../domain/notify";
import { sendPush, type PushTarget } from "./push.service";

const PAUSES = "pauses:work_session_pauses!work_session_pauses_session_id_user_id_fkey(paused_at, resumed_at)";

/** Facts for one user (service role: every query filters by user_id explicitly, ADR 0010). */
export async function loadNotifyInput(admin: SupabaseServerClient, userId: string, now: Date): Promise<NotifyInput> {
  const { timezone, settings } = await getSchedulerContext(admin, userId);
  const today = toLocalDate(now, timezone);
  const yesterday = addLocalDays(today, -1, timezone);
  const range = localDayRange(today, timezone);
  const since = localDayRange(addLocalDays(today, -QUIET_CHANGE_DAYS, timezone), timezone).start;
  const soonEnd = new Date(now.getTime() + BLOCK_SOON_MINUTES * 60_000).toISOString();
  const [prefs, sent, soon, dayBlocks, daySessions, reflection, habits, checks, missions, sessions] = await Promise.all([
    admin.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("notification_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("local_date", today).neq("kind", "test"),
    admin
      .from("schedule_blocks")
      .select("id, starts_at, status, task:tasks!schedule_blocks_task_id_user_id_fkey(title, status)")
      .eq("user_id", userId)
      .eq("status", "planned")
      .gt("starts_at", now.toISOString())
      .lte("starts_at", soonEnd),
    admin.from("schedule_blocks").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("starts_at", range.start).lt("starts_at", range.end),
    admin.from("work_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("started_at", range.start).lt("started_at", range.end),
    admin.from("daily_reflections").select("reflection_date").eq("user_id", userId).eq("reflection_date", today).maybeSingle(),
    admin.from("habits").select("id, title, rule, status, weekdays, created_at, mission_id").eq("user_id", userId).eq("status", "active"),
    admin.from("habit_checks").select("habit_id, local_date").eq("user_id", userId).gte("local_date", addLocalDays(today, -QUIET_CHANGE_DAYS, timezone)),
    admin.from("missions").select("id, title, created_at").eq("user_id", userId).eq("status", "active"),
    admin
      .from("work_sessions")
      .select(`started_at, ended_at, source, ${PAUSES}, task:tasks!work_sessions_task_id_user_id_fkey(mission_id, project:projects!tasks_project_id_user_id_fkey(mission_id))`)
      .eq("user_id", userId)
      .gte("started_at", since)
      .limit(5000),
  ]);
  for (const r of [prefs, sent, soon, dayBlocks, daySessions, reflection, habits, checks, missions, sessions]) if (r.error) throw fromDbError(r.error);

  const due = (h: { rule: string; status: string; weekdays: number[] }, d: string) =>
    isDueOn({ rule: h.rule as HabitRule, status: h.status as ArchivableStatus, weekdays: h.weekdays }, d);
  const checkedYesterday = new Set(checks.data!.filter((c) => c.local_date === yesterday).map((c) => c.habit_id));
  const missedHabits = habits
    .data!.filter((h) => toLocalDate(h.created_at, timezone) <= yesterday && due(h, yesterday) && due(h, today) && !checkedYesterday.has(h.id))
    .map((h) => h.title);

  const activeMissions = new Set<string>();
  for (const s of sessions.data!) {
    const m = s.task?.mission_id ?? s.task?.project?.mission_id;
    if (m && s.ended_at && focusStats(s, s.pauses ?? []).focusedMs > 0) activeMissions.add(m);
  }
  const habitMission = new Map(habits.data!.map((h) => [h.id, h.mission_id]));
  for (const c of checks.data!) {
    const m = habitMission.get(c.habit_id);
    if (m) activeMissions.add(m);
  }
  const quietCutoff = addLocalDays(today, -QUIET_CHANGE_DAYS, timezone);
  const quietChanges = missions
    .data!.filter((m) => toLocalDate(m.created_at, timezone) <= quietCutoff && !activeMissions.has(m.id))
    .map((m) => ({ id: m.id, title: m.title }));

  const p = prefs.data;
  const notifyPrefs: NotifyPrefs = p
    ? { block_soon: p.block_soon, checkin: p.checkin, habit_missed: p.habit_missed, change_quiet: p.change_quiet, vocab_due: p.vocab_due, quiet_start: p.quiet_start, quiet_end: p.quiet_end, daily_cap: p.daily_cap }
    : DEFAULT_PREFS;
  return {
    now: now.toISOString(),
    localDate: today,
    localHour: Number(toLocalTime(now, timezone).slice(0, 2)),
    localTime: toLocalTime(now, timezone).slice(0, 5),
    weekStart: localWeek(today, timezone, settings.week_starts_on).startDate,
    eveningHour: settings.evening_hour,
    prefs: notifyPrefs,
    sentToday: sent.count ?? 0,
    blocks: soon.data!.map((b) => ({
      id: b.id,
      startsAt: b.starts_at,
      status: b.status,
      taskTitle: b.task?.title ?? "",
      taskOpen: (OPEN_TASK_STATUSES as readonly string[]).includes(b.task?.status ?? ""),
    })),
    missedHabits,
    checkinDone: reflection.data !== null,
    dayHadActivity: (dayBlocks.count ?? 0) > 0 || (daySessions.count ?? 0) > 0,
    quietChanges,
    vocabDue: null,
  };
}

/** Deliver one notification to every device; dead subscriptions are removed. Returns devices reached. */
export async function deliver(db: SupabaseServerClient, userId: string, targets: PushTarget[], n: Pick<Notification, "title" | "body" | "url" | "dedupeKey">): Promise<number> {
  let reached = 0;
  for (const t of targets) {
    const r = await sendPush(t, { title: n.title, body: n.body, url: n.url, tag: n.dedupeKey });
    if (r === "sent") {
      reached += 1;
      await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", t.id).eq("user_id", userId);
    } else if (r === "gone") {
      await db.from("push_subscriptions").delete().eq("id", t.id).eq("user_id", userId);
    }
  }
  return reached;
}

/**
 * The 5-minute tick (ADR 0043): for every user with a device, decide with `notify-v1`, log first (unique dedupe key
 * → at most once), then push. A failed push is not retried (better lost than duplicated).
 */
export async function runNotifications(admin: SupabaseServerClient, now = new Date()) {
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").limit(10000);
  if (error) throw fromDbError(error);
  const byUser = new Map<string, PushTarget[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  let users = 0;
  for (const [userId, targets] of byUser) {
    try {
      const input = await loadNotifyInput(admin, userId, now);
      const due = selectNotifications(input);
      users += 1;
      for (const n of due) {
        const logged = await admin
          .from("notification_log")
          .upsert(
            { user_id: userId, kind: n.kind, dedupe_key: n.dedupeKey, local_date: input.localDate, title: n.title },
            { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
          )
          .select("id");
        if (logged.error) throw fromDbError(logged.error);
        if (!logged.data.length) continue; // already sent by an earlier tick
        if ((await deliver(admin, userId, targets, n)) > 0) sent += 1;
      }
    } catch (e) {
      log({ action: "job.notifications.user", userId, success: false, errorCode: "INTERNAL_ERROR", detail: String(e) });
    }
  }
  return { users, sent };
}
