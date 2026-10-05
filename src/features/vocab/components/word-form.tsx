"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CEFR_LEVELS, POS_OPTIONS } from "../domain/notion-schema";
import type { WordFields } from "../domain/word-mapping";
import type { TermSuggestion } from "../services/enrich.service";

export type WordFormValues = Omit<WordFields, "topics"> & { topics: string[] };

export const EMPTY_WORD: WordFormValues = { term: "", meaning: null, pos: null, ipa: null, example: null, synonyms: null, note: null, topics: [], cefr: null };

/** Shared by add and edit. Topics are typed comma-separated (Notion forbids commas inside a topic). */
export function WordForm({
  initial,
  submitLabel,
  pending,
  fieldErrors,
  onSubmit,
  aiFill,
}: {
  initial: WordFormValues;
  submitLabel: string;
  pending: boolean;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (values: Record<string, unknown>) => void;
  /** [AI 채우기]: fills only the fields that are still empty; nothing is saved until [저장]. */
  aiFill?: (term: string) => Promise<TermSuggestion | null>;
}) {
  const [topicsText, setTopicsText] = useState(initial.topics.join(", "));
  const [filling, setFilling] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const fillEmpty = async () => {
    const form = formRef.current;
    if (!form || !aiFill) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    const term = field("term")?.value.trim();
    if (!term) return void toast.message("단어를 먼저 입력해 주세요.");
    setFilling(true);
    const s = await aiFill(term);
    setFilling(false);
    if (!s) return;
    const values: Record<string, string | null> = { meaning: s.meaning, pos: s.pos, ipa: s.ipa, example: s.example, synonyms: s.synonyms, cefr: s.cefr };
    let filled = 0;
    for (const [name, value] of Object.entries(values)) {
      const el = field(name);
      if (el && value && !el.value.trim()) {
        el.value = value;
        filled += 1;
      }
    }
    toast.success(filled ? "AI가 빈 칸을 채웠어요. 확인한 뒤 저장해 주세요." : "채울 빈 칸이 없어요.");
  };
  const err = (k: string) => fieldErrors?.[k]?.[0] ?? fieldErrors?.[`patch.${k}`]?.[0];

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const text = (k: string) => String(fd.get(k) ?? "");
        onSubmit({
          term: text("term"),
          meaning: text("meaning"),
          pos: text("pos"),
          ipa: text("ipa"),
          example: text("example"),
          synonyms: text("synonyms"),
          note: text("note"),
          cefr: text("cefr"),
          topics: topicsText.split(",").map((t) => t.trim()).filter(Boolean),
        });
      }}
    >
      <Field id="term" label="단어" error={err("term")}>
        <div className="flex gap-2">
          <Input id="term" name="term" defaultValue={initial.term} required maxLength={200} autoComplete="off" />
          {aiFill && (
            <Button type="button" variant="outline" onClick={() => void fillEmpty()} disabled={filling}>
              <Sparkles aria-hidden />
              {filling ? "채우는 중…" : "AI 채우기"}
            </Button>
          )}
        </div>
      </Field>
      <Field id="meaning" label="뜻" error={err("meaning")}>
        <Textarea id="meaning" name="meaning" defaultValue={initial.meaning ?? ""} rows={2} maxLength={1000} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="pos" label="품사" error={err("pos")}>
          <select id="pos" name="pos" defaultValue={initial.pos ?? ""} className={nativeSelectClass}>
            <option value="">선택 안 함</option>
            {POS_OPTIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field id="cefr" label="레벨" error={err("cefr")}>
          <select id="cefr" name="cefr" defaultValue={initial.cefr ?? ""} className={nativeSelectClass}>
            <option value="">선택 안 함</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="topics" label="주제 (쉼표로 구분)" error={err("topics")}>
        <Input id="topics" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder="예: 업무, 여행" autoComplete="off" />
      </Field>
      <Field id="ipa" label="발음" error={err("ipa")}>
        <Input id="ipa" name="ipa" defaultValue={initial.ipa ?? ""} maxLength={200} autoComplete="off" />
      </Field>
      <Field id="example" label="예문" error={err("example")}>
        <Textarea id="example" name="example" defaultValue={initial.example ?? ""} rows={2} maxLength={1000} />
      </Field>
      <Field id="synonyms" label="유의어" error={err("synonyms")}>
        <Input id="synonyms" name="synonyms" defaultValue={initial.synonyms ?? ""} maxLength={500} autoComplete="off" />
      </Field>
      <Field id="note" label="메모" error={err("note")}>
        <Textarea id="note" name="note" defaultValue={initial.note ?? ""} rows={2} maxLength={2000} />
      </Field>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
