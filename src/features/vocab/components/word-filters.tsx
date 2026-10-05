import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nativeSelectClass } from "@/components/ui/native-select";
import { CEFR_LEVELS, STUDY_STATUSES } from "../domain/notion-schema";
import type { TopicCount, WordFilter } from "../queries/word.queries";

/** Filters live in the URL (GET form), like the finance transaction list. */
export function WordFilters({ filter, topics }: { filter: WordFilter; topics: TopicCount[] }) {
  return (
    <form className="flex flex-wrap items-center gap-2" action="/english/words">
      <Input name="q" defaultValue={filter.q ?? ""} placeholder="단어·뜻 검색" aria-label="검색" className="w-full sm:w-48" />
      <select name="topic" defaultValue={filter.topic ?? ""} aria-label="주제" className={nativeSelectClass}>
        <option value="">모든 주제</option>
        {topics.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.count})
          </option>
        ))}
      </select>
      <select name="level" defaultValue={filter.level ?? ""} aria-label="레벨" className={nativeSelectClass}>
        <option value="">모든 레벨</option>
        {CEFR_LEVELS.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
      <select name="status" defaultValue={filter.status ?? ""} aria-label="상태" className={nativeSelectClass}>
        <option value="">모든 상태</option>
        {STUDY_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline">
        적용
      </Button>
      <Link href="/english/words" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        초기화
      </Link>
    </form>
  );
}
