import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReviewSession } from "@/features/vocab/components/review-session";
import { setupState } from "@/features/vocab/domain/connection";
import { parseScope } from "@/features/vocab/schemas/review.schema";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { loadReviewSession } from "@/features/vocab/services/review.service";

export const metadata: Metadata = { title: "복습 · 단어장", robots: { index: false } };

/** Flashcard review (spec §7.4). The queue is built once on the server; the session runs on the client. */
export default async function EnglishReviewPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const view = await getConnectionView(supabase, user.id);
  if (setupState(view) === "not_connected" || setupState(view) === "pick_page") redirect("/english");
  const scope = parseScope((await searchParams).scope);
  const { items, retention } = await loadReviewSession({ user, supabase }, scope);
  return <ReviewSession items={items} retention={retention} scopeLabel={scope.kind === "topic" ? `주제: ${scope.topic}` : "전체"} />;
}
