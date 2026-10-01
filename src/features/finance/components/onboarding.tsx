"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { createHouseholdAction, joinHouseholdAction } from "../actions/finance.actions";
import { Field } from "./transaction-form";

/**
 * First visit (ADR 0025): create a household (you become its owner, default categories are added) or join your
 * partner's with their invite code.
 */
export function FinanceOnboarding({ suggestedName }: { suggestedName: string }) {
  const { run, pending } = useActionRunner();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const err = (k: string) => errors[k]?.[0];

  const submit = (action: (input: unknown) => ReturnType<typeof createHouseholdAction>, success: string) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const input = Object.fromEntries(fd.entries());
      run(() => action(input), { success }).then((r) => setErrors(r.ok ? {} : (r.fieldErrors ?? {})));
    };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">가계부</h1>
        <p className="text-sm text-muted-foreground">
          가계부는 가계(Household) 단위로 함께 씁니다. 새 가계를 만들거나, 배우자에게 받은 초대 코드로 참여하세요.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <form
          aria-label="새 가계 만들기"
          onSubmit={submit(createHouseholdAction, "가계를 만들었습니다.")}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <h2 className="font-medium">새 가계 만들기</h2>
          <p className="text-xs text-muted-foreground">기본 카테고리가 함께 만들어지고, 나중에 설정에서 바꿀 수 있습니다.</p>
          <Field label="가계 이름" htmlFor="household-name" error={err("name")}>
            <Input id="household-name" name="name" defaultValue="우리 집" required maxLength={100} />
          </Field>
          <Field label="내 표시 이름" htmlFor="create-display-name" error={err("displayName")}>
            <Input id="create-display-name" name="displayName" defaultValue={suggestedName} required maxLength={50} />
          </Field>
          <Button type="submit" disabled={pending}>
            만들기
          </Button>
        </form>
        <form
          aria-label="초대 코드로 참여"
          onSubmit={submit(joinHouseholdAction, "가계에 참여했습니다.")}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <h2 className="font-medium">초대 코드로 참여</h2>
          <p className="text-xs text-muted-foreground">초대 코드는 가계 소유자의 설정 → 가계 구성원에 있습니다.</p>
          <Field label="초대 코드" htmlFor="invite-code" error={err("code")}>
            <Input id="invite-code" name="code" required autoComplete="off" className="font-mono uppercase" maxLength={40} />
          </Field>
          <Field label="내 표시 이름" htmlFor="join-display-name" error={err("displayName")}>
            <Input id="join-display-name" name="displayName" defaultValue={suggestedName} required maxLength={50} />
          </Field>
          <Button type="submit" variant="outline" disabled={pending}>
            참여하기
          </Button>
        </form>
      </div>
    </div>
  );
}
