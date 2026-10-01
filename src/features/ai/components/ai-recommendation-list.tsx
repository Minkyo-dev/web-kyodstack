"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { ActionResult } from "@/lib/errors";
import { formatMinutes } from "@/features/scheduler/utils/duration";
import { acceptAiRecommendationAction, rejectAiRecommendationAction } from "../actions/recommendation.actions";
import type { PendingRecommendation } from "../queries/ai.queries";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";

type RunResult =
  | { status: "created"; count: number; capacityMinutes: number }
  | { status: "skipped"; reason: string; capacityMinutes: number };

/**
 * AI suggestions are advisory (spec §3.4, §65): each one is explainable (rationale),
 * editable (edit, then accept) and rejectable. Accepting creates the task.
 */
export function AiRecommendationList({
  items,
  showGenerate = true,
  emptyText = "아직 추천이 없습니다.",
}: {
  items: PendingRecommendation[];
  showGenerate?: boolean;
  emptyText?: string;
}) {
  const router = useRouter();
  const [generating, startGenerating] = useTransition();

  const generate = () =>
    startGenerating(async () => {
      const res = await fetch("/api/ai/daily-recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await res.json().catch(() => null)) as ActionResult<RunResult> | null;
      if (!body || !body.ok) {
        toast.error(body && !body.ok ? body.message : "추천을 받지 못했습니다.");
        return;
      }
      if (body.data.status === "skipped") toast.info(body.data.reason);
      else toast.success(`추천 ${body.data.count}개 (남은 시간 ${formatMinutes(body.data.capacityMinutes)})`);
      router.refresh();
    });

  return (
    <section aria-labelledby="ai-recs-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ai-recs-heading" className="flex items-center gap-1 text-sm font-semibold">
          <Sparkles className="size-3.5 text-ai" aria-hidden />
          AI 추천
        </h2>
        {showGenerate && (
          <Button size="xs" variant="outline" onClick={generate} disabled={generating}>
            {generating ? "생성 중…" : items.length ? "다시 추천" : "추천 받기"}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5" aria-label="AI 추천 목록">
          {items.map((r) => (
            <AiRecommendationItem key={r.id} rec={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AiRecommendationItem({ rec }: { rec: PendingRecommendation }) {
  const { run, pending } = useActionRunner();
  const terms = useTerms();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-ai/30 bg-ai/5 px-2.5 py-2 text-sm" aria-label={`AI 추천: ${rec.title}`}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block font-medium">{rec.title}</span>
          <span className="block text-xs text-muted-foreground">
            {rec.project?.name}
            {rec.milestone && ` › ${rec.milestone.name}`}
            {rec.estimated_minutes && ` · ${formatMinutes(rec.estimated_minutes)}`}
            {rec.priority && ` · 우선순위 ${rec.priority}`}
          </span>
        </button>
        <ChevronDown className={`mt-1 size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </div>
      {open && rec.rationale && <p className="mt-1.5 text-xs text-muted-foreground">이유: {rec.rationale}</p>}

      {editing ? (
        <form
          className="mt-2 space-y-1.5"
          aria-label="추천 수정 후 수락"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const est = String(fd.get("estimate") ?? "");
            run(
              () =>
                acceptAiRecommendationAction({
                  recommendationId: rec.id,
                  title: String(fd.get("title") ?? ""),
                  estimatedMinutes: est ? Number(est) : undefined,
                }),
              { success: `${josa(terms.task, "으로/로")} 추가했습니다.` },
            );
          }}
        >
          <label className="sr-only" htmlFor={`rec-title-${rec.id}`}>
            제목
          </label>
          <Input id={`rec-title-${rec.id}`} name="title" defaultValue={rec.title} required maxLength={200} />
          <div className="flex gap-1.5">
            <label className="sr-only" htmlFor={`rec-est-${rec.id}`}>
              예상 시간(분)
            </label>
            <Input
              id={`rec-est-${rec.id}`}
              name="estimate"
              type="number"
              min={5}
              max={720}
              step={5}
              defaultValue={rec.estimated_minutes ?? ""}
              className="w-24"
            />
            <Button type="submit" size="sm" disabled={pending}>
              수락
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex gap-1">
          <Button
            size="xs"
            disabled={pending}
            onClick={() =>
              run(() => acceptAiRecommendationAction({ recommendationId: rec.id }), { success: `${josa(terms.task, "으로/로")} 추가했습니다.` })
            }
          >
            수락
          </Button>
          <Button size="xs" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
            수정
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => rejectAiRecommendationAction({ recommendationId: rec.id }))}
          >
            거절
          </Button>
        </div>
      )}
    </li>
  );
}
