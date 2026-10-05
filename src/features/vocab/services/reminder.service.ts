import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { setupState } from "../domain/connection";
import { getConnectionView } from "./connection.service";
import { loadReviewSession } from "./review.service";
import { getStudySettings } from "./settings.service";

/**
 * Facts for the `vocab_due` push (notify-v2): today's capped queue and the reminder time. Null without a ready word
 * table or with the reminder off; the queue is only built once the reminder time has come (5-minute job tick).
 */
export async function vocabReminderFacts(
  db: SupabaseServerClient,
  userId: string,
  localTime: string,
): Promise<{ reviews: number; newCards: number; reminderTime: string } | null> {
  const settings = await getStudySettings(db, userId);
  if (!settings.reminderEnabled) return null;
  if (localTime < settings.reminderTime) return { reviews: 0, newCards: 0, reminderTime: settings.reminderTime };
  if (setupState(await getConnectionView(db, userId)) !== "ready") return null;
  const { items } = await loadReviewSession({ supabase: db, user: { id: userId } }, { kind: "all" });
  const newCards = items.filter((i) => i.state.fsrsState === "new").length;
  return { reviews: items.length - newCards, newCards, reminderTime: settings.reminderTime };
}
