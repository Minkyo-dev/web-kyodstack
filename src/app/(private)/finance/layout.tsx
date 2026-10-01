import Link from "next/link";
import { Rows3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { requireUserOrRedirect } from "@/lib/auth";
import { PageHelp } from "@/components/layout/page-help";
import { FinanceNav } from "@/features/finance/components/finance-nav";
import { FinanceOnboarding } from "@/features/finance/components/onboarding";
import { AddTransactionButton } from "@/features/finance/components/panels";
import { FinanceProvider } from "@/features/finance/components/finance-provider";
import { getFinanceContext, getFinanceLookups } from "@/features/finance/queries/household.queries";

/**
 * Finance shell: without a household the user sees onboarding (create or join, ADR 0025); otherwise the household's
 * reference data is loaded once here and shared with every client leaf through FinanceProvider.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  const ctx = await getFinanceContext(user.id);
  if (!ctx) return <FinanceOnboarding suggestedName={user.email?.split("@")[0] ?? ""} />;
  const lookups = (await getFinanceLookups(user.id))!;

  return (
    <FinanceProvider lookups={lookups}>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b border-border px-4 pt-3 md:px-6">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">가계부</h1>
            <PageHelp page="finance" />
            <span className="truncate text-sm text-muted-foreground">· {ctx.household.name}</span>
            <Link href="/finance/transactions/bulk" className={buttonVariants({ variant: "outline", className: "ml-auto" })}>
              <Rows3 aria-hidden />
              <span className="hidden sm:inline">여러 건 입력</span>
              <span className="sr-only sm:hidden">여러 건 입력</span>
            </Link>
            <AddTransactionButton />
          </div>
          <FinanceNav />
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </FinanceProvider>
  );
}
