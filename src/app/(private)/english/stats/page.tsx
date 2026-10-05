import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatsView } from "@/features/vocab/components/stats-view";
import { setupState } from "@/features/vocab/domain/connection";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { loadStats } from "@/features/vocab/services/stats.service";

export const metadata: Metadata = { title: "통계 · 단어장", robots: { index: false } };

export default async function EnglishStatsPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const state = setupState(await getConnectionView(supabase, user.id));
  if (state === "not_connected" || state === "pick_page") redirect("/english");
  return <StatsView stats={await loadStats({ user, supabase })} />;
}
