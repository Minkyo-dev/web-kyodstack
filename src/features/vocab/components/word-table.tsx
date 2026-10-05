"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { WordListItem } from "../queries/word.queries";
import { deleteWordAction, updateWordAction } from "../actions/word.actions";
import { StudyStatusBadge } from "./study-status";
import { WordForm } from "./word-form";

/** Dense word list; a row opens the drawer with the word in context (spec §10 단어). */
export function WordTable({ rows }: { rows: WordListItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const word = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">단어</th>
              <th className="px-3 py-2 font-medium">뜻</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">주제</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">레벨</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="cursor-pointer border-t hover:bg-accent/40" onClick={() => setOpenId(w.id)}>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpenId(w.id)}>
                    {w.term}
                  </button>
                  {w.pos && <span className="ml-1.5 text-xs text-muted-foreground">{w.pos}</span>}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">{w.meaning ?? "—"}</td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {w.topics.map((t) => (
                      <span key={t} className="rounded-sm border px-1.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-xs sm:table-cell">{w.cefr ?? "—"}</td>
                <td className="hidden px-3 py-2 sm:table-cell">
                  <StudyStatusBadge status={w.notionStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={!!word} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {word && <WordDrawerBody key={word.id} word={word} onDone={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function WordDrawerBody({ word, onDone }: { word: WordListItem; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>{word.term}</SheetTitle>
        <SheetDescription className="flex items-center gap-3">
          <StudyStatusBadge status={word.notionStatus} />
          {word.notionUrl && (
            <a href={word.notionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
              Notion에서 열기
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </SheetDescription>
      </SheetHeader>
      <WordForm
        initial={word}
        submitLabel="저장"
        pending={pending}
        fieldErrors={errors}
        onSubmit={(values) =>
          run(() => updateWordAction({ id: word.id, patch: values }), { success: "저장했어요." }).then((r) => {
            if (r.ok) onDone();
            else setErrors(r.fieldErrors ?? {});
          })
        }
      />
      <div className="border-t pt-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Notion 휴지통으로 옮길까요?</span>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteWordAction({ id: word.id }), { success: "삭제했어요.", onSuccess: onDone })}>
              삭제 확인
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              취소
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            삭제
          </Button>
        )}
      </div>
    </div>
  );
}
