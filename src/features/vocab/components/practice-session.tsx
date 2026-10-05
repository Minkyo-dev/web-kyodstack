"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Lightbulb, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PracticeFeedback } from "../ai/practice.schema";
import { CEFR_RUBRIC } from "../domain/cefr";
import { MAX_ATTEMPTS } from "../domain/practice";
import { spaceBefore, wordDiff } from "../domain/word-diff";
import type { PracticeAttempt, PracticeSessionView } from "../services/practice.service";
import { submitAnswerAction } from "../actions/practice.actions";
import { canSpeak, speak } from "./speak";

const VERDICT = {
  correct: { label: "자연스러워요", Icon: CircleCheck },
  minor_issues: { label: "거의 맞았어요", Icon: CircleAlert },
  incorrect: { label: "다시 볼까요", Icon: CircleX },
} as const;
const CATEGORY: Record<PracticeFeedback["corrections"][number]["category"], string> = {
  grammar: "문법",
  word_choice: "단어 선택",
  article: "관사",
  tense: "시제",
  preposition: "전치사",
  word_order: "어순",
  spelling: "철자",
  other: "기타",
};
const REGISTER = { casual: "캐주얼", neutral: "중립", formal: "격식" } as const;

/** One practice set (spec §9.3): Korean sentence → English answer → structured feedback; up to 3 tries per sentence. */
export function PracticeSession({ session }: { session: PracticeSessionView }) {
  const [items, setItems] = useState(session.items);
  const [index, setIndex] = useState(() => Math.max(0, session.items.findIndex((i) => i.attempts.length === 0)));
  const [answer, setAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const item = items[index];
  const latest = item.attempts.at(-1) ?? null;
  const canRetry = item.attempts.length < MAX_ATTEMPTS;
  const writing = !latest || answer !== "";

  const go = (i: number) => {
    setIndex(i);
    setAnswer("");
    setShowHint(false);
  };

  const submit = async () => {
    if (!answer.trim() || sending) return;
    setSending(true);
    const res = await submitAnswerAction({ itemId: item.id, answer });
    setSending(false);
    if (!res.ok) return void toast.error(res.message);
    const attempt: PracticeAttempt = res.data;
    setItems((all) => all.map((it) => (it.id === item.id ? { ...it, attempts: [...it.attempts, attempt] } : it)));
    setAnswer("");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-sm border px-1.5 text-xs font-medium" title={CEFR_RUBRIC[session.cefr].label}>
          {session.cefr}
        </span>
        <span className="font-medium tabular-nums">
          문장 {index + 1} / {items.length}
        </span>
        <nav aria-label="문장" className="ml-auto flex gap-1">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-label={`문장 ${i + 1}${it.attempts.length ? " (답함)" : ""}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => go(i)}
              className={cn("flex size-6 items-center justify-center rounded-sm border text-xs", i === index && "border-ring bg-accent", it.attempts.length > 0 && "font-semibold")}
            >
              {it.attempts.length ? "✓" : i + 1}
            </button>
          ))}
        </nav>
      </div>

      <article className="space-y-3 rounded-lg border bg-card p-5">
        <p className="text-xl leading-relaxed font-medium">{item.promptKo}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">목표 표현</span>
          {item.targets.map((t) => (
            <span key={t.id} className="rounded-sm border px-1.5">
              {t.term}
              {t.meaning && <span className="text-muted-foreground"> · {t.meaning}</span>}
            </span>
          ))}
          {item.hintKo && (
            <Button size="xs" variant="ghost" onClick={() => setShowHint((v) => !v)} aria-expanded={showHint}>
              <Lightbulb aria-hidden />
              힌트
            </Button>
          )}
        </div>
        {showHint && item.hintKo && <p className="text-sm text-muted-foreground">힌트: {item.hintKo}</p>}

        {canRetry && writing && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Textarea
              ref={inputRef}
              aria-label="영어 번역"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="영어로 번역해 보세요 (Enter 제출 · Shift+Enter 줄바꿈)"
              rows={3}
              maxLength={500}
              autoFocus
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={!answer.trim() || sending}>
                {sending && <Loader2 className="animate-spin" aria-hidden />}
                {sending ? "AI가 살펴보는 중…" : "제출"}
              </Button>
              {latest && (
                <Button type="button" variant="ghost" onClick={() => setAnswer("")}>
                  취소
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {item.attempts.length} / {MAX_ATTEMPTS}번 시도
              </span>
            </div>
          </form>
        )}
      </article>

      {latest && <Feedback attempt={latest} />}

      {latest && (
        <div className="flex flex-wrap items-center gap-2">
          {canRetry && answer === "" && (
            <Button
              variant="outline"
              onClick={() => {
                setAnswer(latest.answer);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              다시 써보기
            </Button>
          )}
          {index > 0 && (
            <Button variant="ghost" onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden />
              이전
            </Button>
          )}
          {index < items.length - 1 ? (
            <Button onClick={() => go(index + 1)}>
              다음 문장
              <ChevronRight aria-hidden />
            </Button>
          ) : (
            <Link href="/english/practice" className={buttonVariants()}>
              연습 마치기
            </Link>
          )}
        </div>
      )}

      {item.attempts.length > 1 && (
        <details className="rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">이전 시도 {item.attempts.length - 1}개</summary>
          <ul className="mt-2 space-y-3">
            {item.attempts.slice(0, -1).map((a) => (
              <li key={a.id} className="space-y-1">
                <p>{a.answer}</p>
                <p className="text-xs text-muted-foreground">
                  {VERDICT[a.feedback.verdict].label} → {a.feedback.corrected_sentence}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Feedback({ attempt }: { attempt: PracticeAttempt }) {
  const f = attempt.feedback;
  const { label, Icon } = VERDICT[f.verdict];
  const diff = wordDiff(attempt.answer, f.corrected_sentence);
  const changed = diff.some((d) => d.type !== "same");
  const speech = canSpeak();
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Icon className="size-4" aria-hidden />
          {label}
        </span>
        <span className="text-muted-foreground">
          · 목표 표현 {f.target_usage.used ? (f.target_usage.correct ? "바르게 사용" : "사용했지만 어색함") : "사용 안 함"}
        </span>
      </div>
      {f.target_usage.note_ko && <p className="text-muted-foreground">{f.target_usage.note_ko}</p>}

      <div className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">내 문장 → 고친 문장</h3>
        {changed ? (
          <p className="leading-7" aria-label={`고친 문장: ${f.corrected_sentence}`}>
            {diff.map((d, i) => (
              <span key={i}>
                {i > 0 && spaceBefore(d.text) ? " " : ""}
                {d.type === "same" ? (
                  d.text
                ) : d.type === "del" ? (
                  <del className="text-muted-foreground decoration-2">{d.text}</del>
                ) : (
                  <ins className="font-semibold underline decoration-primary decoration-2 underline-offset-4">{d.text}</ins>
                )}
              </span>
            ))}
          </p>
        ) : (
          <p>{f.corrected_sentence} <span className="text-xs text-muted-foreground">(고칠 곳 없음)</span></p>
        )}
      </div>

      {f.corrections.length > 0 && (
        <ul className="space-y-1.5">
          {f.corrections.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 rounded-sm border px-1.5 text-xs">{CATEGORY[c.category]}</span>
              <span>
                <del className="text-muted-foreground">{c.original}</del> → <strong>{c.corrected}</strong>
                <span className="block text-xs text-muted-foreground">{c.explanation_ko}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">더 자연스러운 문장</h3>
        <p className="flex items-start gap-1 text-base">
          <span>{f.natural_sentence}</span>
          {speech && (
            <Button size="icon-xs" variant="ghost" aria-label="자연스러운 문장 듣기" onClick={() => speak(f.natural_sentence)}>
              <Volume2 aria-hidden />
            </Button>
          )}
        </p>
      </div>

      <div className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">다른 표현과 뉘앙스</h3>
        <ul className="space-y-2">
          {f.alternatives.map((a, i) => (
            <li key={i} className="space-y-0.5">
              <p>
                <span className="mr-1.5 rounded-sm border px-1 text-[11px] text-muted-foreground">{REGISTER[a.register]}</span>
                {a.sentence}
              </p>
              <p className="text-xs text-muted-foreground">{a.nuance_ko}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
