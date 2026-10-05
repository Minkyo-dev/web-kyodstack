import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUserOrRedirect } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { PracticeSession } from "@/features/vocab/components/practice-session";
import { loadPracticeSession } from "@/features/vocab/services/practice.service";

export const metadata: Metadata = { title: "연습 · 단어장", robots: { index: false } };

export default async function EnglishPracticeSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserOrRedirect();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await loadPracticeSession({ user, supabase: await createClient() }, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!session) notFound();
  return <PracticeSession session={session} />;
}
