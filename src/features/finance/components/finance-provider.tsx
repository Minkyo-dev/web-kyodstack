"use client";

import { createContext, useContext, useMemo } from "react";
import type { Account, FinanceLookups } from "../domain/finance.types";
import { categoryPath } from "../domain/aggregate";

type FinanceView = FinanceLookups & {
  accountName: (id: string | null) => string | null;
  categoryLabel: (id: string | null) => string | null;
  memberName: (id: string | null) => string | null;
  activeAccounts: Account[];
};

const FinanceContext = createContext<FinanceView | null>(null);

/** Reference data for every finance client leaf; loaded once by the finance layout and refreshed by revalidatePath. */
export function FinanceProvider({ lookups, children }: { lookups: FinanceLookups; children: React.ReactNode }) {
  const value = useMemo<FinanceView>(() => {
    const accounts = new Map(lookups.accounts.map((a) => [a.id, a]));
    const members = new Map(lookups.members.map((m) => [m.userId, m]));
    return {
      ...lookups,
      accountName: (id) => (id ? (accounts.get(id)?.name ?? null) : null),
      categoryLabel: (id) => categoryPath(lookups.categories, id),
      memberName: (id) => (id ? (members.get(id)?.displayName ?? null) : null),
      activeAccounts: lookups.accounts.filter((a) => a.is_active),
    };
  }, [lookups]);
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceView {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance must be used inside FinanceProvider");
  return value;
}
