"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { syncNowAction } from "../actions/word.actions";

/** [지금 동기화]: full reconcile with Notion (spec §6.2, §6.5). */
export function SyncButton({ lastSynced }: { lastSynced: string }) {
  const { run, pending } = useActionRunner();
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>마지막 동기화 {lastSynced}</span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => syncNowAction({}), { success: "Notion과 동기화했어요." })}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        지금 동기화
      </Button>
    </div>
  );
}
