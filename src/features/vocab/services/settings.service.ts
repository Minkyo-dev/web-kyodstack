import "server-only";
import { fromDbError } from "@/lib/errors";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Direction } from "../domain/queue";
import type { Cefr } from "../domain/word-mapping";
import type { VocabCtx } from "./connection.service";

export type StudySettings = {
  newPerDay: number;
  reviewsPerDay: number;
  desiredRetention: number;
  directions: Direction[];
  defaultCefr: Cefr;
  reminderEnabled: boolean;
  reminderTime: string;
};

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
  directions: ["recognition", "recall"],
  defaultCefr: "B1",
  reminderEnabled: true,
  reminderTime: "20:00",
};

/** The user's study settings; the defaults until they save the form once. */
export async function getStudySettings(supabase: SupabaseServerClient, userId: string): Promise<StudySettings> {
  const { data, error } = await supabase
    .from("vocab_settings")
    .select("new_per_day, reviews_per_day, desired_retention, directions, default_cefr, reminder_enabled, reminder_time")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return DEFAULT_STUDY_SETTINGS;
  return {
    newPerDay: data.new_per_day,
    reviewsPerDay: data.reviews_per_day,
    desiredRetention: Number(data.desired_retention),
    directions: data.directions as Direction[],
    defaultCefr: data.default_cefr as Cefr,
    reminderEnabled: data.reminder_enabled,
    reminderTime: data.reminder_time.slice(0, 5),
  };
}

export async function updateStudySettings(ctx: VocabCtx, patch: Partial<StudySettings>): Promise<void> {
  const row: Record<string, unknown> = { user_id: ctx.user.id };
  if (patch.newPerDay !== undefined) row.new_per_day = patch.newPerDay;
  if (patch.reviewsPerDay !== undefined) row.reviews_per_day = patch.reviewsPerDay;
  if (patch.desiredRetention !== undefined) row.desired_retention = patch.desiredRetention;
  if (patch.directions !== undefined) row.directions = patch.directions;
  if (patch.defaultCefr !== undefined) row.default_cefr = patch.defaultCefr;
  if (patch.reminderEnabled !== undefined) row.reminder_enabled = patch.reminderEnabled;
  if (patch.reminderTime !== undefined) row.reminder_time = patch.reminderTime;
  const { error } = await ctx.supabase.from("vocab_settings").upsert(row as { user_id: string }, { onConflict: "user_id" });
  if (error) throw fromDbError(error);
}
