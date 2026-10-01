"use client";

import { TermsContext } from "@/hooks/use-terms";
import { termsFor } from "@/lib/terms";

/** Quest terminology for client components (E2 spec §4). */
export function TermsProvider({ quest, children }: { quest: boolean; children: React.ReactNode }) {
  return <TermsContext.Provider value={termsFor(quest)}>{children}</TermsContext.Provider>;
}
