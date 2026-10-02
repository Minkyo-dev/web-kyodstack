import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { termsFor } from "@/lib/terms";
import { getPlayerProfile } from "@/features/gamification/queries/xp.queries";
import { PlannerManual } from "@/features/manual/components/planner-manual";

export const metadata: Metadata = { title: "매뉴얼", robots: { index: false } };

export default async function ManualPage() {
  const user = await requireUserOrRedirect();
  const profile = await getPlayerProfile(await createClient(), user.id);
  return <PlannerManual terms={termsFor(!!profile?.gamification_enabled && !!profile.quest_terminology)} />;
}
