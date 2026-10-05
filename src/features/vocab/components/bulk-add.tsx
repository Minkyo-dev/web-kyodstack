"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseBulk, type BulkRow } from "../domain/bulk-parse";
import type { Enrichment } from "../domain/enrich";
import { createWordAction, enrichWordsAction } from "../actions/word.actions";

type Row = BulkRow & { include: boolean; extra: Partial<Enrichment>; result: "added" | { error: string } | null };
const AI_CHUNK = 20;

/** 일괄 추가 (spec §9.2): paste → preview with duplicate flags → optional AI fill → write through to Notion one by one. */
export function BulkAdd({ existingTerms }: { existingTerms: string[] }) {
  const existing = useMemo(() => new Set(existingTerms), [existingTerms]);
  const [text, setText] = useState("");
  const [topics, setTopics] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [overflow, setOverflow] = useState(0);
  const [busy, setBusy] = useState<"ai" | "add" | null>(null);
  const [progress, setProgress] = useState(0);

  const preview = () => {
    const parsed = parseBulk(text, existing);
    setRows(parsed.rows.map((r) => ({ ...r, include: r.duplicate === null, extra: {}, result: null })));
    setOverflow(parsed.overflow);
  };
  const update = (line: number, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.line === line ? { ...r, ...patch } : r)) ?? null);
  const pending = rows?.filter((r) => r.include && r.result !== "added") ?? [];

  const fillWithAi = async () => {
    const targets = pending.filter((r) => !r.meaning);
    if (targets.length === 0) return void toast.message("뜻이 비어 있는 단어가 없어요.");
    setBusy("ai");
    for (let i = 0; i < targets.length; i += AI_CHUNK) {
      const chunk = targets.slice(i, i + AI_CHUNK);
      const res = await enrichWordsAction({ terms: chunk.map((r) => r.term) });
      if (!res.ok) {
        toast.error(res.message);
        break;
      }
      const byTerm = new Map(res.data.map((s) => [s.term, s]));
      setRows((rs) =>
        rs?.map((r) => {
          const s = byTerm.get(r.term);
          if (!s || r.meaning) return r;
          const { term: _t, meaning, ...extra } = s;
          void _t;
          return { ...r, meaning, extra };
        }) ?? null,
      );
    }
    setBusy(null);
  };

  const addAll = async () => {
    const targets = pending;
    const topicList = topics.split(",").map((t) => t.trim()).filter(Boolean);
    setBusy("add");
    setProgress(0);
    let added = 0;
    for (const [i, r] of targets.entries()) {
      const res = await createWordAction({ term: r.term, meaning: r.meaning ?? "", topics: topicList, ...r.extra });
      update(r.line, { result: res.ok ? "added" : { error: res.message } });
      if (res.ok) added += 1;
      setProgress(i + 1);
    }
    setBusy(null);
    if (added) toast.success(`${added}개를 Notion에 추가했어요.`);
  };

  if (!rows) {
    return (
      <div className="max-w-3xl space-y-3">
        <Label htmlFor="bulk-text">한 줄에 한 단어 · `단어 - 뜻`, `단어 : 뜻`, 탭 구분 모두 가능 · 뜻은 비워도 돼요</Label>
        <Textarea id="bulk-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={"ubiquitous - 어디에나 있는\nrun out of\t~이 다 떨어지다\nserendipity"} />
        <div className="flex gap-2">
          <Button onClick={preview} disabled={!text.trim()}>
            미리보기
          </Button>
          <Link href="/english/words" className={buttonVariants({ variant: "ghost" })}>
            취소
          </Link>
        </div>
      </div>
    );
  }

  const included = rows.filter((r) => r.include);
  const done = rows.filter((r) => r.result === "added").length;
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="bulk-topics">주제 (모든 단어에 적용, 쉼표로 구분)</Label>
          <Input id="bulk-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="예: 업무" className="w-64" />
        </div>
        <Button variant="outline" onClick={() => void fillWithAi()} disabled={busy !== null || pending.every((r) => r.meaning)}>
          {busy === "ai" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          AI로 빈 칸 채우기
        </Button>
        <Button onClick={() => void addAll()} disabled={busy !== null || pending.length === 0}>
          {busy === "add" ? `추가 중 ${progress} / ${pending.length + progress}` : `${pending.length}개 추가`}
        </Button>
        <Button variant="ghost" onClick={() => setRows(null)} disabled={busy !== null}>
          다시 붙여넣기
        </Button>
      </div>
      {overflow > 0 && <p className="text-sm text-muted-foreground">한 번에 200줄까지예요. 나머지 {overflow}줄은 다음에 붙여넣어 주세요.</p>}
      <p className="text-xs text-muted-foreground">
        {rows.length}줄 · 선택 {included.length} · 추가됨 {done}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2 font-medium">
                <span className="sr-only">추가</span>
              </th>
              <th className="px-3 py-2 font-medium">단어</th>
              <th className="px-3 py-2 font-medium">뜻</th>
              <th className="px-3 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line} className="border-t">
                <td className="px-3 py-1.5">
                  <input type="checkbox" aria-label={`${r.term} 추가`} checked={r.include} disabled={r.result === "added"} onChange={(e) => update(r.line, { include: e.target.checked })} />
                </td>
                <td className="px-3 py-1.5 font-medium">{r.term}</td>
                <td className="px-3 py-1.5">
                  <Input aria-label={`${r.term} 뜻`} value={r.meaning ?? ""} onChange={(e) => update(r.line, { meaning: e.target.value || null })} className="h-7" disabled={r.result === "added"} />
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {r.result === "added" ? (
                    <span className="inline-flex items-center gap-1">
                      <CircleCheck className="size-3.5" aria-hidden /> 추가됨
                    </span>
                  ) : r.result ? (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <CircleAlert className="size-3.5" aria-hidden /> {r.result.error}
                    </span>
                  ) : r.duplicate === "existing" ? (
                    <span className="text-muted-foreground">이미 있는 단어</span>
                  ) : r.duplicate === "paste" ? (
                    <span className="text-muted-foreground">위와 중복</span>
                  ) : r.extra.pos ? (
                    <span className="text-muted-foreground">AI 제안 · {r.extra.pos}</span>
                  ) : (
                    <span className="text-muted-foreground">새 단어</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {done > 0 && (
        <Link href="/english/words" className={buttonVariants({ variant: "outline" })}>
          단어 목록으로
        </Link>
      )}
    </div>
  );
}
