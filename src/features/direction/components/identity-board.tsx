"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { josa, TERMS } from "@/lib/terms";
import { createIdentityAction, reorderIdentitiesAction, setPurposeAction, updateIdentityAction } from "../actions/direction.actions";
import { moveItem } from "../domain/reorder";
import type { Identity, Purpose } from "../domain/direction.types";
import { Example, str } from "./blueprint-ui";

/** "나는 어떤 사람이 되고 싶은가": the vision sentence and the role chips (ADR 0038 §2). */
export function IdentityBoard({ purpose, identities }: { purpose: Purpose | null; identities: Identity[] }) {
  const { run, pending } = useActionRunner();
  const [editingVision, setEditingVision] = useState(!purpose);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const active = identities.filter((i) => i.status === "active");
  const archived = identities.filter((i) => i.status === "archived");

  const save = (i: Identity, patch: Partial<{ name: string; status: "active" | "archived" }>, onSuccess?: () => void) =>
    run(
      () =>
        updateIdentityAction({
          identityId: i.id,
          name: patch.name ?? i.name,
          description: i.description,
          status: patch.status ?? i.status,
          sortOrder: i.sort_order,
        }),
      { onSuccess },
    );
  const move = (index: number, delta: -1 | 1) =>
    run(() => reorderIdentitiesAction({ identityIds: moveItem(active.map((i) => i.id), index, delta) }));

  return (
    <section aria-labelledby="identity-board-title" className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 id="identity-board-title" className="text-sm font-semibold">
          나는 어떤 사람이 되고 싶은가
        </h2>
        <p className="text-xs text-muted-foreground">습관은 결과보다 정체성에서 시작합니다. 행동 하나하나가 이 역할에 던지는 한 표입니다.</p>
      </div>

      <div aria-label={TERMS.directive} role="group" className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{TERMS.directive}</h3>
          {!editingVision && (
            <Button size="icon-xs" variant="ghost" aria-label={`${TERMS.directive} 편집`} onClick={() => setEditingVision(true)}>
              <Pencil aria-hidden />
            </Button>
          )}
        </div>
        {editingVision ? (
          <form
            aria-label={`${TERMS.directive} 편집`}
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const statement = str(new FormData(e.currentTarget), "statement");
              run(() => setPurposeAction({ statement }), { success: "저장했습니다.", onSuccess: () => setEditingVision(false) });
            }}
          >
            <Textarea
              aria-label={`${TERMS.directive} 문장`}
              name="statement"
              rows={2}
              maxLength={280}
              required
              defaultValue={purpose?.statement ?? ""}
              placeholder="왜 이 일을 하나요? 한 문장으로 적어 보세요."
            />
            <p className="text-[11px]">
              <Example>배운 것을 나누며 성장하는 삶</Example>
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                저장
              </Button>
              {purpose && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingVision(false)}>
                  취소
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="text-lg font-medium whitespace-pre-line">{purpose?.statement}</p>
        )}
      </div>

      <div aria-label={TERMS.identity} role="group" className="space-y-2">
        <h3 className="text-xs font-semibold tracking-widest text-muted-foreground">{`${TERMS.identity} · 나는 ~하는 사람이다`}</h3>
        <ul aria-label={`${TERMS.identity} 목록`} className="flex flex-wrap gap-2">
          {active.map((i, index) => (
            <li key={i.id} aria-label={`${TERMS.identity} ${i.name}`} className="flex items-center gap-1 rounded-md border border-border py-1 pr-1 pl-2.5 text-sm">
              {editingRole === i.id ? (
                <form
                  aria-label={`${i.name} 이름 바꾸기`}
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(i, { name: str(new FormData(e.currentTarget), "name") }, () => setEditingRole(null));
                  }}
                >
                  <Input name="name" aria-label="역할 이름" required maxLength={40} defaultValue={i.name} className="h-7 w-40" autoFocus />
                  <Button type="submit" size="xs" disabled={pending}>
                    저장
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setEditingRole(null)}>
                    취소
                  </Button>
                </form>
              ) : (
                <>
                  {index === 0 && <span className="rounded-sm bg-muted px-1 text-[10px] font-semibold tracking-wider">{TERMS.className}</span>}
                  <span className="mr-1">{i.name}</span>
                  <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 앞으로`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                    <ArrowLeft aria-hidden />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 뒤로`} disabled={pending || index === active.length - 1} onClick={() => move(index, 1)}>
                    <ArrowRight aria-hidden />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 이름 바꾸기`} onClick={() => setEditingRole(i.id)}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button size="xs" variant="ghost" disabled={pending} onClick={() => save(i, { status: "archived" })}>
                    보관
                  </Button>
                </>
              )}
            </li>
          ))}
          <li>
            {adding || active.length === 0 ? (
              <form
                aria-label={`새 ${TERMS.identity}`}
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  run(() => createIdentityAction({ name: str(new FormData(form), "name") }), {
                    onSuccess: () => {
                      form.reset();
                      setAdding(false);
                    },
                  });
                }}
              >
                <Input name="name" aria-label="역할 이름" required maxLength={40} placeholder="예: 매일 쓰는 개발자" className="h-8 w-52" autoFocus={adding} />
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  추가
                </Button>
                {adding && active.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                    취소
                  </Button>
                )}
              </form>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                {`${TERMS.identity} 추가`}
              </Button>
            )}
          </li>
        </ul>
        {active.length === 0 && (
          <p className="text-xs text-muted-foreground">{`'나는 ~하는 사람이다'에 들어갈 말로 ${josa(TERMS.identity, "을/를")} 1~3개 적어 보세요. 첫 번째가 ${TERMS.className}입니다.`}</p>
        )}
        {archived.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">보관됨 ({archived.length})</summary>
            <ul className="mt-1 flex flex-wrap gap-2">
              {archived.map((i) => (
                <li key={i.id} className="flex items-center gap-1">
                  {i.name}
                  <Button size="xs" variant="ghost" disabled={pending} onClick={() => save(i, { status: "active" })}>
                    복원
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
