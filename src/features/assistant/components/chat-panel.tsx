"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleSlash, ListPlus, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { clearChatAction, sendChatMessageAction } from "../actions/chat.actions";
import { applyProposalAction, dismissProposalAction } from "../actions/proposal.actions";
import type { ChatMessage, ChatProposal } from "../queries/chat.queries";

const SUGGESTIONS = ["오늘 뭐부터 할까?", "이번 주 어땠어?", "막힌 변화 점검해줘"];
const STATUS_TEXT: Record<string, string> = { applied: "적용함", dismissed: "넘김" };

/**
 * 비서 (ADR 0042): a button at the right of the planner tab bar opens the conversation (in the header, so it never
 * covers the focus bar or other bottom controls). Replies are plain text; changes only
 * arrive as proposal cards that the owner applies or passes over.
 */
export function ChatPanel({ messages, proposals, currentWeek }: { messages: ChatMessage[]; proposals: ChatProposal[]; currentWeek: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const { run, pending } = useActionRunner();
  const endRef = useRef<HTMLDivElement>(null);
  const byId = new Map(proposals.map((p) => [p.id, p]));

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages.length, sending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setSending(message);
    setDraft("");
    run(() => sendChatMessageAction({ message }), {
      onSuccess: () => setSending(null),
      onError: () => setSending(null),
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 shrink-0" aria-label="비서 열기" onClick={() => setOpen(true)}>
        <Bot aria-hidden />
        비서
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-md">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle className="flex items-center gap-1.5">
              <Bot className="size-4" aria-hidden />
              비서
            </SheetTitle>
            <SheetDescription>내 기록을 보고 답합니다. 바꾸는 일은 제안 카드로만 해요.</SheetDescription>
          </SheetHeader>

          <div role="log" aria-label="대화" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !sending && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>무엇이든 물어보세요. 오늘 할 일, 습관, 변화, 이번 주 기록을 보고 답해요.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={pending} onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                <p
                  aria-label={m.role === "user" ? "내 메시지" : "비서 답변"}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/40",
                  )}
                >
                  {m.content}
                </p>
                {m.proposal_ids.map((id) => {
                  const p = byId.get(id);
                  return p ? <ProposalCard key={id} p={p} current={p.week_start === currentWeek} /> : null;
                })}
              </div>
            ))}
            {sending && (
              <div className="flex flex-col items-end gap-2">
                <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-line text-primary-foreground opacity-70">{sending}</p>
                <p className="flex items-center gap-1.5 self-start text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  생각하는 중…
                </p>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            aria-label="비서에게 보내기"
            className="space-y-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Textarea
              aria-label="메시지"
              rows={2}
              maxLength={2000}
              value={draft}
              placeholder="예: 내일 오후에 보고서 2시간 잡아줘"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending || messages.length === 0}
                onClick={() => run(() => clearChatAction({}), { success: "대화를 비웠습니다." })}
              >
                <RotateCcw aria-hidden />새 대화
              </Button>
              <Button type="submit" size="sm" disabled={pending || !draft.trim()}>
                <Send aria-hidden />
                보내기
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ProposalCard({ p, current }: { p: ChatProposal; current: boolean }) {
  const { run, pending } = useActionRunner();
  return (
    <div role="group" aria-label={`제안 ${p.title}`} className="w-[85%] space-y-1.5 rounded-lg border border-border p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ListPlus className="size-3.5" aria-hidden />할 일 추가 제안
      </p>
      <p className="font-medium">{p.title}</p>
      <p className="text-xs text-muted-foreground">{p.reason}</p>
      {p.status === "proposed" ? (
        current ? (
          <div className="flex gap-2">
            <Button size="xs" disabled={pending} onClick={() => run(() => applyProposalAction({ proposalId: p.id }), { success: "할 일을 추가했습니다." })}>
              적용
            </Button>
            <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => dismissProposalAction({ proposalId: p.id }), { success: "넘겼습니다." })}>
              넘기기
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">기간 지남</p>
        )
      ) : (
        <p className="flex items-center gap-1 text-xs">
          {p.status === "applied" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleSlash className="size-3.5" aria-hidden />}
          {STATUS_TEXT[p.status]}
        </p>
      )}
    </div>
  );
}
