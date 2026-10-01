import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { HouseholdSettings } from "@/features/finance/components/household-settings";
import { getFinanceContext } from "@/features/finance/queries/household.queries";

export const metadata: Metadata = { title: "가계 구성원", robots: { index: false } };

export default async function FinanceHouseholdPage() {
  const user = await requireUserOrRedirect();
  const ctx = (await getFinanceContext(user.id))!;
  return (
    <HouseholdSettings
      name={ctx.household.name}
      inviteCode={ctx.household.invite_code}
      me={ctx.me}
      members={ctx.members}
    />
  );
}
