"use client";

import Link from "next/link";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, Keyboard, Pencil, Undo2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProgressSinkContext } from "@/hooks/progress-sink";
import { cn } from "@/lib/utils";
import { blankTerm, suggestRating } from "../domain/answer-match";
import { applyRating, previewIntervals, type CardState, type ReviewRating } from "../domain/srs";
import type { ReviewItem } from "../services/review.service";
import { finishSessionAction, reviewCardAction, setLearnedAction, undoReviewAction } from "../actions/review.actions";
import { updateWordAction } from "../actions/word.actions";
import { canSpeak, speak } from "./speak";
import { WordForm } from "./word-form";

const RATINGS: { rating: ReviewRating; label: string }[] = [
  { rating: 1, label: "다시" },
  { rating: 2, label: "어려움" },
  { rating: 3, label: "알맞음" },
  { rating: 4, label: "쉬움" },
];
/** A card whose next step is this close comes back in the same session (spec §7.3). */
const REQUEUE_WITHIN_MS = 20 * 60_000;
const REQUEUE_GAP = 3;

type Done = { item: ReviewItem; rating: ReviewRating; pending: Promise<boolean> };

/** RemNote-style review (spec §7.4): one card, Space to reveal, 1–4 to rate, keyboard-first. */
export function ReviewSession({ items, retention, scopeLabel }: { items: ReviewItem[]; retention: number; scopeLabel: string }) {
  const [queue, setQueue] = useState(items);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [history, setHistory] = useState<Done[]>([]);
  const [counts, setCounts] = useState<Record<ReviewRating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [summary, setSummary] = useState<{ tomorrowDue: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [againWords, setAgainWords] = useState<string[]>([]);
  const shownAt = useRef(0);
  const [speechReady, setSpeechReady] = useState(false);

  const current = queue[0] ?? null;
  const reviewed = Object.values(counts).reduce((a, b) => a + b, 0);

  useEffect(() => setSpeechReady(canSpeak()), []);
  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.cardId, current?.state.reps]);

  const previews = useMemo(() => (current ? previewIntervals(current.state, new Date(), { retention }) : null), [current, retention]);
  const suggestion = current && revealed && current.direction === "recall" ? suggestRating(typed, current.word.term) : null;

  const sink = useContext(ProgressSinkContext);
  const finish = useCallback(async () => {
    const res = await finishSessionAction({});
    if (res.ok && res.progress) sink(res.progress); // planner XP for a review day (ADR 0046 V6)
    setSummary(res.ok ? res.data : { tomorrowDue: 0 });
  }, [sink]);

  useEffect(() => {
    if (!current && !summary && reviewed > 0) void finish();
  }, [current, summary, reviewed, finish]);

  const replaceState = (cardId: string, state: CardState) =>
    setQueue((q) => q.map((it) => (it.cardId === cardId ? { ...it, state } : it)));

  const rate = (rating: ReviewRating) => {
    if (!current || !revealed) return;
    const item = current;
    const now = new Date();
    const local = applyRating(item.state, rating, now, { retention });
    const durationMs = Date.now() - shownAt.current;
    setQueue((q) => {
      const rest = q.slice(1);
      if (new Date(local.due).getTime() - now.getTime() <= REQUEUE_WITHIN_MS) rest.splice(Math.min(REQUEUE_GAP, rest.length), 0, { ...item, state: local });
      return rest;
    });
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    if (rating === 1) setAgainWords((w) => (w.includes(item.word.id) ? w : [...w, item.word.id]));
    setRevealed(false);
    setTyped("");
    const pending = reviewCardAction({ cardId: item.cardId, rating, durationMs, clientReviewId: crypto.randomUUID(), expectedReps: item.state.reps }).then((res) => {
      if (res.ok) {
        replaceState(item.cardId, res.data.state);
        return true;
      }
      toast.error(res.message);
      setQueue((q) => [item, ...q.filter((it) => it.cardId !== item.cardId)]);
      setCounts((c) => ({ ...c, [rating]: Math.max(0, c[rating] - 1) }));
      setHistory((h) => h.filter((d) => d.item !== item));
      return false;
    });
    setHistory((h) => [...h, { item, rating, pending }]);
  };

  const undo = async () => {
    const last = history.at(-1);
    if (!last || busy) return;
    setBusy(true);
    try {
      if (!(await last.pending)) return;
      const res = await undoReviewAction({ cardId: last.item.cardId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setHistory((h) => h.slice(0, -1));
      setCounts((c) => ({ ...c, [last.rating]: Math.max(0, c[last.rating] - 1) }));
      setQueue((q) => [{ ...last.item, state: res.data.state }, ...q.filter((it) => it.cardId !== last.item.cardId)]);
      setRevealed(false);
      setTyped("");
      setSummary(null);
      toast.success("방금 평가를 되돌렸어요.");
    } finally {
      setBusy(false);
    }
  };

  const markLearned = async () => {
    if (!current || busy) return;
    const wordId = current.word.id;
    setBusy(true);
    const res = await setLearnedAction({ wordId, learned: true });
    setBusy(false);
    if (!res.ok) return void toast.error(res.message);
    toast.success(`'${current.word.term}'을(를) 학습 완료로 표시했어요.`);
    setQueue((q) => q.filter((it) => it.word.id !== wordId));
    setRevealed(false);
    setTyped("");
  };

  const say = () => current && speak(current.direction === "recall" && !revealed ? "" : current.word.term);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (editing || summary || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.closest("input, textarea, select, [contenteditable=true]") || target.closest("[role=dialog]"))) return;
      if (e.key === " " || e.key === "Enter") {
        if (!current) return;
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else if (suggestion) rate(suggestion);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        rate(Number(e.key) as ReviewRating);
      } else if (e.key === "z" || e.key === "Z") {
        void undo();
      } else if (e.key === "d" || e.key === "D") {
        void markLearned();
      } else if (e.key === "e" || e.key === "E") {
        if (current) setEditing(true);
      } else if (e.key === "p" || e.key === "P") {
        say();
      } else if (e.key === "Escape") {
        void finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (summary) {
    return (
      <section className="mx-auto max-w-xl space-y-4 rounded-lg border bg-card p-6 text-center" aria-live="polite">
        <CircleCheck className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">오늘 복습을 마쳤어요</h2>
        <p className="text-sm text-muted-foreground">
          {reviewed}장 · 다시 {counts[1]} · 어려움 {counts[2]} · 알맞음 {counts[3]} · 쉬움 {counts[4]}
        </p>
        <p className="text-sm">내일 복습 예정 {summary.tomorrowDue}장</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/english" className={buttonVariants({ variant: "outline" })}>
            홈으로
          </Link>
          {againWords.length > 0 && (
            <Link href={`/english/practice?words=${againWords.slice(0, 10).join(",")}`} className={buttonVariants()}>
              틀린 단어로 AI 연습
            </Link>
          )}
          {history.length > 0 && (
            <Button variant="ghost" onClick={() => void undo()} disabled={busy}>
              <Undo2 aria-hidden />
              마지막 평가 되돌리기
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="mx-auto max-w-xl space-y-3 rounded-lg border bg-card p-6 text-center text-sm">
        <p>지금 복습할 카드가 없어요.</p>
        <Link href="/english" className={buttonVariants({ variant: "outline" })}>
          홈으로
        </Link>
      </section>
    );
  }

  const { word } = current;
  const isRecall = current.direction === "recall";
  const blanked = isRecall ? blankTerm(word.example, word.term) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-28 md:pb-0">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium tabular-nums" aria-label="진행">
          {reviewed} / {reviewed + queue.length}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${(reviewed / Math.max(1, reviewed + queue.length)) * 100}%` }} />
        </div>
        <span className="rounded-sm border px-1.5 text-xs text-muted-foreground">{scopeLabel}</span>
        <ShortcutHelp />
        <Button size="sm" variant="ghost" onClick={() => void finish()}>
          <X aria-hidden />
          종료
        </Button>
      </div>

      <article className="flex min-h-72 flex-col gap-4 rounded-lg border bg-card p-6" aria-live="polite">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isRecall ? "뜻 → 영어" : "영어 → 뜻"}</span>
          {word.topics.map((t) => (
            <span key={t} className="rounded-sm border px-1.5">
              {t}
            </span>
          ))}
          <span className="ml-auto flex gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="편집 (E)" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="학습 완료 (D)" onClick={() => void markLearned()} disabled={busy}>
              <CircleCheck aria-hidden />
            </Button>
          </span>
        </div>

        {isRecall ? (
          <div className="space-y-2">
            <p className="text-2xl font-semibold">{word.meaning ?? "(뜻 없음)"}</p>
            {word.pos && <p className="text-sm text-muted-foreground">{word.pos}</p>}
            {blanked && <p className="text-sm text-muted-foreground">{blanked}</p>}
            {!revealed && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRevealed(true);
                }}
              >
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="영어로 입력 (선택) 후 Enter" aria-label="답 입력" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              </form>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-3xl font-semibold tracking-tight">{word.term}</p>
            {word.pos && <span className="text-sm text-muted-foreground">{word.pos}</span>}
            {speechReady && (
              <Button size="icon-sm" variant="ghost" aria-label="발음 듣기 (P)" onClick={() => speak(word.term)}>
                <Volume2 aria-hidden />
              </Button>
            )}
          </div>
        )}

        {revealed ? (
          <div className="space-y-2 border-t pt-4 text-sm">
            {isRecall && (
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold">{word.term}</p>
                {speechReady && (
                  <Button size="icon-sm" variant="ghost" aria-label="발음 듣기 (P)" onClick={() => speak(word.term)}>
                    <Volume2 aria-hidden />
                  </Button>
                )}
              </div>
            )}
            {isRecall && typed.trim() && (
              <p className="text-muted-foreground">
                내 답: <span className={cn(suggestion === 3 ? "text-foreground" : "line-through")}>{typed}</span>
                {suggestion === 3 ? " · 정답" : suggestion === 2 ? " · 한 글자 차이" : " · 다름"}
              </p>
            )}
            {word.ipa && <p className="text-muted-foreground">{word.ipa}</p>}
            {!isRecall && <p className="text-lg">{word.meaning ?? "(뜻 없음)"}</p>}
            {word.example && (
              <p className="flex items-start gap-1">
                <span>{word.example}</span>
                {speechReady && (
                  <Button size="icon-xs" variant="ghost" aria-label="예문 듣기" onClick={() => speak(word.example ?? "")}>
                    <Volume2 aria-hidden />
                  </Button>
                )}
              </p>
            )}
            {word.synonyms && <p className="text-muted-foreground">유의어: {word.synonyms}</p>}
            {word.note && <p className="text-muted-foreground">메모: {word.note}</p>}
            {word.cefr && <p className="text-xs text-muted-foreground">레벨 {word.cefr}</p>}
          </div>
        ) : (
          <p className="mt-auto text-center text-xs text-muted-foreground">Space를 누르거나 아래 버튼으로 답을 확인하세요</p>
        )}
      </article>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3 md:static md:border-0 md:bg-transparent md:p-0">
        {revealed ? (
          <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
            {RATINGS.map(({ rating, label }) => (
              <Button
                key={rating}
                variant={suggestion === rating ? "default" : "outline"}
                className="h-auto flex-col gap-0.5 py-2"
                onClick={() => rate(rating)}
                aria-keyshortcuts={String(rating)}
              >
                <span className="font-medium">{label}</span>
                <span className="text-xs opacity-80">{previews?.[rating]}</span>
                <span className="hidden text-[10px] opacity-60 md:inline">{rating}</span>
              </Button>
            ))}
          </div>
        ) : (
          <Button className="mx-auto flex w-full max-w-2xl" onClick={() => setRevealed(true)} aria-keyshortcuts="Space">
            답 보기 <span className="text-xs opacity-70">Space</span>
          </Button>
        )}
      </div>

      <div className="hidden justify-end md:flex">
        <Button size="sm" variant="ghost" onClick={() => void undo()} disabled={history.length === 0 || busy}>
          <Undo2 aria-hidden />
          되돌리기 <span className="text-xs opacity-60">Z</span>
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogTitle>단어 편집</DialogTitle>
          <WordForm
            initial={word}
            submitLabel="저장"
            pending={busy}
            onSubmit={async (values) => {
              setBusy(true);
              const res = await updateWordAction({ id: word.id, patch: values });
              setBusy(false);
              if (!res.ok) return void toast.error(res.message);
              toast.success("저장했어요.");
              setEditing(false);
              setQueue((q) => q.map((it) => (it.word.id === word.id ? { ...it, word: { ...it.word, ...(values as Partial<ReviewItem["word"]>) } } : it)));
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShortcutHelp() {
  return (
    <Popover>
      <PopoverTrigger aria-label="단축키" className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
        <Keyboard className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-56 text-xs">
        <dl className="grid grid-cols-[3.5rem_1fr] gap-y-1">
          <dt className="font-mono">Space</dt>
          <dd>답 보기</dd>
          <dt className="font-mono">1–4</dt>
          <dd>다시 · 어려움 · 알맞음 · 쉬움</dd>
          <dt className="font-mono">Z</dt>
          <dd>되돌리기</dd>
          <dt className="font-mono">D</dt>
          <dd>학습 완료</dd>
          <dt className="font-mono">E</dt>
          <dd>편집</dd>
          <dt className="font-mono">P</dt>
          <dd>발음 듣기</dd>
          <dt className="font-mono">Esc</dt>
          <dd>종료</dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
