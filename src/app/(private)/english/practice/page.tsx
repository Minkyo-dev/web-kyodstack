import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PracticeBuilder } from "@/features/vocab/components/practice-builder";
import { setupState } from "@/features/vocab/domain/connection";
import { listWords, topicSummary, userTimezone } from "@/features/vocab/queries/word.queries";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { listPracticeSessions } from "@/features/vocab/services/practice.service";
import { getStudySettings } from "@/features/vocab/services/settings.service";

export const metadata: Metadata = { title: "AI 연습 · 단어장", robots: { index: false } };

const SOURCE_LABEL = { topic: "주제", reviewed_today: "오늘 복습", hard: "어려운 단어", manual: "직접 고름" } as const;

/** AI 연습 (spec §9.3): set builder + history. `?words=id,id` preselects a manual set (from the review summary). */
export default async function EnglishPracticePage({ searchParams }: { searchParams: Promise<{ words?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const state = setupState(await getConnectionView(supabase, user.id));
  if (state === "not_connected" || state === "pick_page") redirect("/english");
  const ctx = { user, supabase };
  const timezone = await userTimezone(supabase, user.id);
  const [summary, words, sessions, settings] = await Promise.all([
    topicSummary(supabase, user.id),
    listWords(supabase, user.id, {}, timezone),
    listPracticeSessions(ctx),
    getStudySettings(supabase, user.id),
  ]);
  const known = new Set(words.rows.map((w) => w.id));
  const preselected = ((await searchParams).words ?? "").split(",").filter((id) => known.has(id));
  const dateFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: timezone, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="max-w-3xl space-y-6">
      <PracticeBuilder
        topics={summary.topics.map((t) => t.name)}
        words={words.rows.map((w) => ({ id: w.id, term: w.term, meaning: w.meaning }))}
        preselected={preselected}
        defaultCefr={settings.defaultCefr}
      />
      <section className="space-y-2">
        <h2 className="font-semibold">연습 기록</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 연습한 기록이 없어요.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/english/practice/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/40">
                  <span>
                    <span className="mr-2 rounded-sm border px-1.5 text-xs font-medium">{s.cefr}</span>
                    {SOURCE_LABEL[s.source]}
                    {s.sourceRef ? ` · ${s.sourceRef}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.answered}/{s.items}문장 · {dateFmt.format(new Date(s.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
