"use client";

import { useState } from "react";
import { Pencil, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { josa, TERMS } from "@/lib/terms";
import { switchPathAction, updatePathAction } from "../actions/direction.actions";
import type { Path } from "../domain/direction.types";
import { pathDates } from "../domain/path-dates";
import type { StepState } from "../domain/plan";
import { Field, StepShell, str } from "./blueprint-ui";

function PathFields({ idPrefix, path }: { idPrefix: string; path?: Path }) {
  return (
    <>
      <Field id={`${idPrefix}-title`} label="이름">
        <Input id={`${idPrefix}-title`} name="title" required maxLength={80} defaultValue={path?.title} placeholder="예: 출력 먼저" />
      </Field>
      <Field id={`${idPrefix}-approach`} label="어떻게 반복하나요?">
        <Textarea
          id={`${idPrefix}-approach`}
          name="approach"
          rows={3}
          required
          maxLength={1000}
          defaultValue={path?.approach}
          placeholder="예: 매일 짧게 말하기를 먼저 하고, 문법 공부는 주말에만 한다"
        />
      </Field>
      <Field id={`${idPrefix}-tradeoffs`} label="포기하는 것 (선택)">
        <Textarea id={`${idPrefix}-tradeoffs`} name="tradeOffs" rows={2} maxLength={1000} defaultValue={path?.trade_offs ?? ""} placeholder="예: 새 교재 사기, 단어장 만들기" />
      </Field>
    </>
  );
}

type Mode = "view" | "edit" | "switch";

/** Blueprint step 3: the repeated process. Switching keeps the old one as history (ADR 0020 §5). */
export function PathPanel({
  missionId,
  activePath,
  retiredPaths,
  closed,
  timezone,
  n,
  state,
}: {
  missionId: string;
  activePath: Path | null;
  retiredPaths: Path[];
  closed: boolean;
  timezone: string;
  n: number;
  state: StepState;
}) {
  const { run, pending } = useActionRunner();
  const [mode, setMode] = useState<Mode>("view");
  const setLabel = activePath ? `${TERMS.path} 교체` : `${TERMS.path} 설정`;
  const showSet = !closed && (!activePath || mode === "switch");

  return (
    <StepShell
      n={n}
      title={TERMS.path}
      question="결과를 만드는 반복 과정은 무엇인가요? 매주 반복할 방식과 그 대신 하지 않을 것을 정합니다."
      state={state}
      action={
        activePath &&
        !closed &&
        mode === "view" && (
          <span className="flex gap-1">
            <Button size="xs" variant="outline" onClick={() => setMode("edit")}>
              <Pencil aria-hidden />
              편집
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setMode("switch")}>
              <Repeat aria-hidden />
              {setLabel}
            </Button>
          </span>
        )
      }
    >
      <div aria-label={`현재 ${TERMS.path}`} role="group" className="space-y-2">
        {activePath && mode !== "edit" && (
          <div className="space-y-1.5 rounded-md border border-border p-3">
            <p className="font-semibold">{activePath.title}</p>
            <p className="text-sm whitespace-pre-line">{activePath.approach}</p>
            {activePath.trade_offs && (
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                <span className="font-medium">포기하는 것 · </span>
                {activePath.trade_offs}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{pathDates(activePath, timezone).started}부터</p>
          </div>
        )}
        {activePath && mode === "edit" && (
          <form
            aria-label={`${TERMS.path} 편집`}
            className="space-y-2 rounded-md border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(
                () => updatePathAction({ pathId: activePath.id, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
                { success: "저장했습니다.", onSuccess: () => setMode("view") },
              );
            }}
          >
            <PathFields idPrefix="path-edit" path={activePath} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                저장
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
                취소
              </Button>
            </div>
          </form>
        )}
        {!activePath && closed && <p className="text-sm text-muted-foreground">{`${josa(TERMS.path, "이/가")} 없습니다.`}</p>}
      </div>

      {showSet && (
        <form
          aria-label={setLabel}
          className="space-y-2 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(
              () => switchPathAction({ missionId, title: str(fd, "title"), approach: str(fd, "approach"), tradeOffs: str(fd, "tradeOffs") || null }),
              {
                success: "저장했습니다.",
                onSuccess: () => {
                  form.reset();
                  setMode("view");
                },
              },
            );
          }}
        >
          {activePath && (
            <p className="text-xs text-muted-foreground">
              {`현재 ${josa(TERMS.path, "은/는")} 이력으로 이동하고, 그 ${josa(TERMS.protocol, "은/는")} 보관됩니다. 연결된 작업의 기록은 그대로 남습니다.`}
            </p>
          )}
          <PathFields idPrefix="path-new" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {activePath ? "교체" : "설정"}
            </Button>
            {activePath && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
                취소
              </Button>
            )}
          </div>
        </form>
      )}

      {retiredPaths.length > 0 && (
        <details role="group" aria-label={`이전 ${TERMS.path}`}>
          <summary className="cursor-pointer text-xs text-muted-foreground">{`이전 ${TERMS.path} (${retiredPaths.length})`}</summary>
          <ul className="mt-2 space-y-2">
            {retiredPaths.map((p) => {
              const d = pathDates(p, timezone);
              return (
                <li key={p.id} className="rounded-md border border-border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {p.title}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      교체됨 · {d.started}–{d.retired}
                    </span>
                  </p>
                  <p className="text-xs whitespace-pre-line text-muted-foreground">{p.approach}</p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </StepShell>
  );
}
