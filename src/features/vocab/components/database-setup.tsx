"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { NotionPageRef } from "@/lib/notion/types";
import { createVocabDatabaseAction } from "../actions/connection.actions";

/** Step 3 of setup (spec §5.2): pick one of the shared pages; the DB is created under it. */
export function DatabaseSetup({ pages }: { pages: NotionPageRef[] | "error" }) {
  const { run, pending } = useActionRunner();
  const [selected, setSelected] = useState<string | null>(null);

  if (pages === "error") {
    return <p role="alert" className="text-sm text-muted-foreground">공유된 페이지를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (pages.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <p>공유된 페이지가 없어요.</p>
        <p className="text-muted-foreground">
          [다시 연결]을 누르고 Notion 화면에서 단어장을 둘 페이지를 선택해 주세요. 이미 연결했다면 Notion에서 그 페이지의 ••• → 연결 → Kyod를
          추가해도 됩니다.
        </p>
        <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
          다시 연결
        </a>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) run(() => createVocabDatabaseAction({ parentPageId: selected }), { success: "단어장을 만들었어요." });
      }}
    >
      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">단어장을 만들 페이지</legend>
        {pages.map((page) => (
          <label key={page.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-accent/40">
            <input type="radio" name="parentPageId" value={page.id} checked={selected === page.id} onChange={() => setSelected(page.id)} />
            {page.title}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={!selected || pending}>
        단어장 만들기
      </Button>
    </form>
  );
}
