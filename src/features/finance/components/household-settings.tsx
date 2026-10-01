"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { renameHouseholdAction, rotateInviteCodeAction, updateDisplayNameAction } from "../actions/finance.actions";
import type { MemberRef } from "../domain/finance.types";
import { Field } from "./transaction-form";

/** Household name, members and the invite code (ADR 0025). Only the owner renames or rotates the code. */
export function HouseholdSettings({
  name,
  inviteCode,
  me,
  members,
}: {
  name: string;
  inviteCode: string;
  me: MemberRef;
  members: MemberRef[];
}) {
  const { run, pending } = useActionRunner();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const owner = me.role === "OWNER";

  return (
    <div className="space-y-6">
      <section aria-labelledby="household-name-heading" className="space-y-2">
        <h2 id="household-name-heading" className="text-sm font-medium">
          가계
        </h2>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("name") ?? "");
            run(() => renameHouseholdAction({ name: value }), { success: "가계 이름을 바꿨습니다." });
          }}
        >
          <Field label="가계 이름" htmlFor="settings-household-name" className="flex-1">
            <Input key={name} id="settings-household-name" name="name" defaultValue={name} required maxLength={100} disabled={!owner} />
          </Field>
          {owner && (
            <Button type="submit" size="sm" disabled={pending}>
              저장
            </Button>
          )}
        </form>
      </section>

      <section aria-labelledby="members-heading" className="space-y-2">
        <h2 id="members-heading" className="text-sm font-medium">
          구성원
        </h2>
        <ul className="divide-y divide-border border-y border-border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1">
                {m.displayName}
                {m.userId === me.userId && <span className="text-muted-foreground"> (나)</span>}
              </span>
              <span className="rounded-sm border border-border px-1.5 text-xs text-muted-foreground">
                {m.role === "OWNER" ? "소유자" : "구성원"}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get("displayName") ?? "");
            run(() => updateDisplayNameAction({ displayName: value }), { success: "표시 이름을 바꿨습니다." });
          }}
        >
          <Field label="내 표시 이름" htmlFor="settings-display-name" className="flex-1">
            <Input key={me.displayName} id="settings-display-name" name="displayName" defaultValue={me.displayName} required maxLength={50} />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            저장
          </Button>
        </form>
      </section>

      <section aria-labelledby="invite-heading" className="space-y-2">
        <h2 id="invite-heading" className="text-sm font-medium">
          초대 코드
        </h2>
        <p className="text-xs text-muted-foreground">
          배우자가 가계부 첫 화면에서 이 코드를 입력하면 같은 가계에 참여합니다. 참여한 구성원은 모든 계좌·카테고리·거래를 함께 봅니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border px-3 py-1.5 font-mono text-base tracking-widest" aria-label="초대 코드">
            {inviteCode}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard
                .writeText(inviteCode)
                .then(() => toast.success("복사했습니다."))
                .catch(() => toast.error("복사하지 못했습니다."))
            }
          >
            <Copy aria-hidden />
            복사
          </Button>
          {owner &&
            (confirmRotate ? (
              <>
                <span className="text-xs">이전 코드는 더 이상 쓸 수 없습니다.</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(() => rotateInviteCodeAction(), { success: "새 코드를 만들었습니다.", onSuccess: () => setConfirmRotate(false) })
                  }
                >
                  새 코드 만들기
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmRotate(true)}>
                <RefreshCw aria-hidden />
                코드 바꾸기
              </Button>
            ))}
        </div>
      </section>
    </div>
  );
}
