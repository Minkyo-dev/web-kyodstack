import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import type { DailyReflection } from "../domain/work-session.types";
import type { UpsertReflectionInput } from "../schemas/reflection.schema";

/** One reflection per local day (unique user_id + reflection_date); re-saving updates it. */
export async function upsertDailyReflection(
  ctx: ActionContext,
  input: UpsertReflectionInput,
): Promise<DailyReflection> {
  const { data, error } = await ctx.supabase
    .from("daily_reflections")
    .upsert(
      {
        user_id: ctx.user.id,
        reflection_date: input.reflectionDate,
        mood_score: input.moodScore,
        focus_score: input.focusScore,
        energy_score: input.energyScore,
        note: input.note || null,
      },
      { onConflict: "user_id,reflection_date" },
    )
    .select("reflection_date, mood_score, focus_score, energy_score, note")
    .single();
  if (error) throw fromDbError(error);
  return data;
}
