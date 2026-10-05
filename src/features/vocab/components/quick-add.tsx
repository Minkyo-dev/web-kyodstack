"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createWordAction } from "../actions/word.actions";
import { suggestFor } from "./ai-fill";
import { EMPTY_WORD, WordForm } from "./word-form";

/** "단어 + Enter" opens the full form with the word filled in; saving writes to Notion first. */
export function QuickAdd() {
  const { run, pending } = useActionRunner();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  return (
    <>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) {
            setErrors({});
            setOpen(true);
          }
        }}
      >
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="새 단어" placeholder="새 단어 입력 후 Enter" value={term} onChange={(e) => setTerm(e.target.value)} className="pl-8" autoComplete="off" />
        </div>
      </form>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogTitle>단어 추가</DialogTitle>
          <WordForm
            key={term}
            initial={{ ...EMPTY_WORD, term: term.trim() }}
            submitLabel="Notion에 저장"
            aiFill={suggestFor}
            pending={pending}
            fieldErrors={errors}
            onSubmit={(values) =>
              run(() => createWordAction(values), { success: "단어를 추가했어요." }).then((r) => {
                if (r.ok) {
                  setOpen(false);
                  setTerm("");
                } else setErrors(r.fieldErrors ?? {});
              })
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
