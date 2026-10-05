"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { CEFR_RUBRIC } from "../domain/cefr";
import { CEFR_LEVELS } from "../domain/notion-schema";
import type { PracticeSource } from "../domain/practice";
import type { Cefr } from "../domain/word-mapping";
import { createPracticeAction } from "../actions/practice.actions";

const SOURCES: { value: PracticeSource; label: string; hint: string }[] = [
  { value: "topic", label: "주제", hint: "고른 주제의 단어" },
  { value: "reviewed_today", label: "오늘 복습한 단어", hint: "오늘 카드로 본 단어" },
  { value: "hard", label: "어려운 단어", hint: "자주 잊거나 최근 '다시'를 누른 단어" },
  { value: "manual", label: "직접 고르기", hint: "목록에서 최대 10개" },
];

type WordOption = { id: string; term: string; meaning: string | null };

/** 연습 세트 만들기 (spec §9.3): source, size, CEFR level. Code picks the words; AI writes the sentences. */
export function PracticeBuilder({ topics, words, preselected, defaultCefr }: { topics: string[]; words: WordOption[]; preselected: string[]; defaultCefr: Cefr }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [source, setSource] = useState<PracticeSource>(preselected.length ? "manual" : topics.length ? "topic" : "reviewed_today");
  const [topic, setTopic] = useState(topics[0] ?? "");
  const [picked, setPicked] = useState<string[]>(preselected.slice(0, 10));
  const [size, setSize] = useState(Math.min(10, Math.max(5, preselected.length || 5)));
  const [cefr, setCefr] = useState<Cefr>(defaultCefr);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? words.filter((w) => w.term.toLowerCase().includes(q) || (w.meaning ?? "").includes(q)) : words).slice(0, 100);
  }, [query, words]);

  const start = () =>
    run(() => createPracticeAction({ source, topic: source === "topic" ? topic : undefined, wordIds: source === "manual" ? picked : undefined, size: source === "manual" ? picked.length : size, cefr }), {
      onSuccess: (r) => router.push(`/english/practice/${r.id}`),
    });

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">어떤 단어로 연습할까요?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <label key={s.value} className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-accent/40">
              <input type="radio" name="source" className="mt-1" checked={source === s.value} onChange={() => setSource(s.value)} />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {source === "topic" &&
          (topics.length ? (
            <select aria-label="주제" value={topic} onChange={(e) => setTopic(e.target.value)} className={nativeSelectClass}>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">주제가 있는 단어가 아직 없어요.</p>
          ))}
        {source === "manual" && (
          <div className="space-y-2">
            <Input aria-label="단어 검색" placeholder="단어·뜻 검색" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-64" />
            <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 text-sm sm:grid-cols-2">
              {visible.map((w) => {
                const checked = picked.includes(w.id);
                return (
                  <li key={w.id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && picked.length >= 10}
                        onChange={() => setPicked((p) => (checked ? p.filter((id) => id !== w.id) : [...p, w.id]))}
                      />
                      <span className="truncate">
                        {w.term}
                        {w.meaning && <span className="text-muted-foreground"> · {w.meaning}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{picked.length} / 10개 선택</p>
          </div>
        )}
      </fieldset>

      {source !== "manual" && (
        <div className="space-y-1">
          <Label htmlFor="practice-size">문장 수</Label>
          <select id="practice-size" value={size} onChange={(e) => setSize(Number(e.target.value))} className={nativeSelectClass}>
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}문장
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">난이도</legend>
        <div role="group" aria-label="CEFR 레벨" className="inline-flex flex-wrap rounded-md border p-0.5">
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={cefr === level}
              onClick={() => setCefr(level)}
              className={cn("rounded-sm px-3 py-1 text-sm font-medium", cefr === level ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {cefr} — {CEFR_RUBRIC[cefr].label}
        </p>
      </fieldset>

      <Button onClick={start} disabled={pending || (source === "manual" && picked.length === 0) || (source === "topic" && !topic)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "AI가 문장을 만드는 중…" : "연습 시작"}
      </Button>
    </section>
  );
}
