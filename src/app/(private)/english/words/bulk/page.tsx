import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BulkAdd } from "@/features/vocab/components/bulk-add";
import { setupState } from "@/features/vocab/domain/connection";
import { liveTerms } from "@/features/vocab/queries/word.queries";
import { getConnectionView } from "@/features/vocab/services/connection.service";

export const metadata: Metadata = { title: "일괄 추가 · 단어장", robots: { index: false } };

export default async function EnglishBulkAddPage() {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  if (setupState(await getConnectionView(supabase, user.id)) !== "ready") redirect("/english");
  return <BulkAdd existingTerms={await liveTerms(supabase, user.id)} />;
}
