"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";
import { switchPathAction, updatePathAction } from "../actions/direction.actions";
import type { Path } from "../domain/direction.types";
import { pathDates } from "../domain/path-dates";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function PathFields({ idPrefix, path }: { idPrefix: string; path?: Path }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs text-muted-foreground">이름</Label>
        <Input id={`${idPrefix}-title`} name="title" required maxLength={80} defaultValue={path?.title} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-approach`} className="text-xs text-muted-foreground">접근 방식</Label>
        <Textarea id={`${idPrefix}-approach`} name="approach" rows={3} required maxLength={1000} defaultValue={path?.approach} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-tradeoffs`} className="text-xs text-muted-foreground">포기하는 것</Label>
        <Textarea id={`${idPrefix}-tradeoffs`} name="tradeOffs" rows={2} maxLength={1000} defaultValue={path?.trade_offs ?? ""} />
      </div>
    </>
  );
}

export function PathPanel({
  missionId,
  activePath,
  retiredPaths,
  closed,
  timezone,
}: {
  missionId: string;
  activePath: Path | null;
  retiredPaths: Path[];
  closed: boolean;
  timezone: string;
}) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const switchLabel = activePath ? `${terms.path} 교체` : `${terms.path} 설정`;
  return (
    <section aria-label={`현재 ${terms.path}`} className="space-y-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{`현재 ${terms.path}`}</h3>
      {activePath ? (
        <div className="space-y-2">
          <p className="text-base font-semibold">{activePath.title}</p>
          <p className="text-sm whitespace-pre-line">{activePath.approach}</p>
          {activePath.trade_offs && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              <span className="font-medium">포기하는 것 · </span>
              {activePath.trade_offs}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{pathDates(activePath, timezone).started}부터</p>
          {!closed && (
            <details>
              <summary className="cursor-pointer text-xs">편집</summary>
              <form
                aria-label={`${terms.path} 편집`}
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  run(
                    () => updatePathAction({ pathId: activePath.id, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
                    { success: "저장했습니다." },
                  );
                }}
              >
                <PathFields idPrefix="path-edit" path={activePath} />
                <Button type="submit" size="sm" disabled={pending}>저장</Button>
              </form>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{`아직 ${josa(terms.path, "이/가")} 없습니다. 목표에 어떻게 접근할지, 무엇을 포기할지 적어 보세요.`}</p>
      )}

      {!closed && (
        <details open={!activePath}>
          <summary className="cursor-pointer text-sm font-medium">{switchLabel}</summary>
          <form
            aria-label={switchLabel}
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              run(
                () => switchPathAction({ missionId, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
                { success: "저장했습니다.", onSuccess: () => form.reset() },
              );
            }}
          >
            {activePath && (
              <p className="text-xs text-muted-foreground">
                {`현재 ${josa(terms.path, "은/는")} 이력으로 이동하고, 그 ${josa(terms.protocol, "은/는")} 보관됩니다. 연결된 작업의 기록은 그대로 남습니다.`}
              </p>
            )}
            <PathFields idPrefix="path-new" />
            <Button type="submit" size="sm" disabled={pending}>{activePath ? "교체" : "설정"}</Button>
          </form>
        </details>
      )}

      {retiredPaths.length > 0 && (
        <details role="group" aria-label={`이전 ${terms.path}`}>
          <summary className="cursor-pointer text-xs text-muted-foreground">{`이전 ${terms.path} (${retiredPaths.length})`}</summary>
          <ul className="mt-2 space-y-2">
            {retiredPaths.map((p) => {
              const d = pathDates(p, timezone);
              return (
                <li key={p.id} className="rounded-md border border-border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {p.title} <span className="text-xs font-normal text-muted-foreground">교체됨 · {d.started}–{d.retired}</span>
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{p.approach}</p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
