"use client";

import { useState } from "react";
import { CircleCheck, CircleHelp, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { SchemaState } from "../services/setup.service";
import { disconnectNotionAction, forgetDatabaseAction, repairSchemaAction } from "../actions/connection.actions";

const PROBLEM: Record<"missing" | "wrong_type", string> = { missing: "삭제됨", wrong_type: "유형 바뀜" };

/** Ready state: the DB link, the schema check, reconnect and disconnect (spec §10 설정). */
export function ConnectionPanel({ workspaceName, databaseUrl, schema }: { workspaceName: string | null; databaseUrl: string | null; schema: SchemaState | "unknown" }) {
  const { run, pending } = useActionRunner();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">워크스페이스</dt>
        <dd>{workspaceName ?? "이름 없음"}</dd>
        <dt className="text-muted-foreground">단어장</dt>
        <dd>
          {databaseUrl && (
            <a href={databaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Notion에서 열기
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </dd>
        <dt className="text-muted-foreground">속성</dt>
        <dd className="space-y-2">
          {schema === "unknown" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CircleHelp className="size-4" aria-hidden />
              지금은 Notion 상태를 확인할 수 없어요
            </span>
          )}
          {schema !== "unknown" && schema.state === "ok" && (
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-4 text-primary" aria-hidden />
              속성 정상
            </span>
          )}
          {schema !== "unknown" && schema.state === "mismatch" && (
            <>
              <p className="inline-flex items-center gap-1">
                <TriangleAlert className="size-4" aria-hidden />
                바뀐 속성: {schema.issues.map((i) => `${i.name}(${PROBLEM[i.problem]})`).join(", ")}
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => repairSchemaAction({}), { success: "속성을 복구했어요." })}>
                속성 복구
              </Button>
            </>
          )}
          {schema !== "unknown" && schema.state === "missing_db" && (
            <>
              <p className="inline-flex items-center gap-1">
                <TriangleAlert className="size-4" aria-hidden />
                Notion에서 단어장 DB를 찾을 수 없어요. 삭제됐거나 공유가 해제됐어요.
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => forgetDatabaseAction({}))}>
                새 단어장 만들기
              </Button>
            </>
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <a href="/api/notion/connect" className={buttonVariants({ variant: "outline", size: "sm" })}>
          다시 연결
        </a>
        {confirming ? (
          <>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => disconnectNotionAction({}), { success: "Notion 연결을 해제했어요." })}>
              해제 확인
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              취소
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            연결 해제
          </Button>
        )}
      </div>
    </div>
  );
}
