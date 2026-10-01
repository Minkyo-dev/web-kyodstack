import { FinanceSettingsNav } from "@/features/finance/components/finance-nav";

export default function FinanceSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <FinanceSettingsNav />
      {children}
    </div>
  );
}
