import type { Metadata } from "next";
import { AccountSettings } from "@/features/finance/components/account-settings";

export const metadata: Metadata = { title: "계좌 설정", robots: { index: false } };

export default function FinanceAccountsPage() {
  return <AccountSettings />;
}
