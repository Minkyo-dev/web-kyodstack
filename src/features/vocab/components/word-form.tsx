"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CEFR_LEVELS, POS_OPTIONS } from "../domain/notion-schema";
import type { WordFields } from "../domain/word-mapping";

export type WordFormValues = Omit<WordFields, "topics"> & { topics: string[] };

export const EMPTY_WORD: WordFormValues = { term: "", meaning: null, pos: null, ipa: null, example: null, synonyms: null, note: null, topics: [], cefr: null };

/** Shared by add and edit. Topics are typed comma-separated (Notion forbids commas inside a topic). */
export function WordForm({
  initial,
  submitLabel,
  pending,
  fieldErrors,
  onSubmit,
}: {
  initial: WordFormValues;
  submitLabel: string;
  pending: boolean;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [topicsText, setTopicsText] = useState(initial.topics.join(", "));
  const err = (k: string) => fieldErrors?.[k]?.[0] ?? fieldErrors?.[`patch.${k}`]?.[0];

  return (
    <form
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
        <Input id="term" name="term" defaultValue={initial.term} required maxLength={200} autoComplete="off" />
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
