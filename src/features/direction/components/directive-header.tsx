"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionRunner } from "@/hooks/use-action-runner";
import { useTerms } from "@/hooks/use-terms";
import { josa } from "@/lib/terms";
import { createIdentityAction, setPurposeAction, updateIdentityAction } from "../actions/direction.actions";
import type { Identity, Purpose } from "../domain/direction.types";

export function DirectiveHeader({ purpose, identities }: { purpose: Purpose | null; identities: Identity[] }) {
  const terms = useTerms();
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const active = identities.filter((i) => i.status === "active");
  const archived = identities.filter((i) => i.status === "archived");

  const move = (index: number, delta: -1 | 1) => {
    const a = active[index];
    const b = active[index + delta];
    if (!a || !b) return;
    run(async () => {
      const first = await updateIdentityAction({ identityId: a.id, name: a.name, description: a.description, status: a.status, sortOrder: b.sort_order });
      if (!first.ok) return first;
      return updateIdentityAction({ identityId: b.id, name: b.name, description: b.description, status: b.status, sortOrder: a.sort_order });
    });
  };

  return (
    <div className="space-y-4">
      <section aria-label={terms.directive} className="space-y-2 border-y border-border py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.directive}</h2>
          {!editing && (
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              {purpose ? "편집" : "설정"}
            </Button>
          )}
        </div>
        {editing ? (
          <form
            aria-label={`${terms.directive} 편집`}
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const statement = String(new FormData(e.currentTarget).get("statement") ?? "");
              run(() => setPurposeAction({ statement }), { success: "저장했습니다.", onSuccess: () => setEditing(false) });
            }}
          >
            <Label htmlFor="purpose-statement" className="text-xs text-muted-foreground">
              문장
            </Label>
            <Textarea id="purpose-statement" name="statement" rows={2} maxLength={280} required defaultValue={purpose?.statement ?? ""} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                저장
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                취소
              </Button>
            </div>
          </form>
        ) : purpose ? (
          <p className="text-lg font-medium whitespace-pre-line">{purpose.statement}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{`${josa(terms.directive, "이/가")} 설정되지 않았습니다.`}</p>
        )}
      </section>

      <section aria-label={terms.identity} className="space-y-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">{terms.identity}</h2>
        <ul aria-label={`${terms.identity} 목록`} className="flex flex-wrap gap-2">
          {active.map((i, index) => (
            <li key={i.id} aria-label={`${terms.identity} ${i.name}`} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
              {index === 0 && <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">{terms.className}</span>}
              <span>{i.name}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 앞으로`} disabled={pending || index === 0} onClick={() => move(index, -1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`${i.name} 뒤로`} disabled={pending || index === active.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => updateIdentityAction({ identityId: i.id, name: i.name, description: i.description, status: "archived", sortOrder: i.sort_order }))}
              >
                보관
              </Button>
            </li>
          ))}
        </ul>
        <form
          aria-label={`새 ${terms.identity}`}
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = String(new FormData(form).get("name") ?? "");
            run(() => createIdentityAction({ name }), { onSuccess: () => form.reset() });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="identity-name" className="text-xs text-muted-foreground">
              이름
            </Label>
            <Input id="identity-name" name="name" required maxLength={40} className="h-8 w-48" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            추가
          </Button>
        </form>
        {archived.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">보관됨 ({archived.length})</summary>
            <ul className="mt-1 flex flex-wrap gap-2">
              {archived.map((i) => (
                <li key={i.id} className="flex items-center gap-1">
                  {i.name}
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => updateIdentityAction({ identityId: i.id, name: i.name, description: i.description, status: "active", sortOrder: i.sort_order }))}
                  >
                    복원
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
