import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BulkEntryGrid } from "@/features/finance/components/bulk-entry";

export const metadata: Metadata = { title: "여러 건 입력", robots: { index: false } };

/** Bulk entry (ADR 0027): a keyboard-first grid for many expenses and income at once. Lookups come from the layout. */
export default function FinanceBulkEntryPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Link
          href="/finance/transactions"
          aria-label="거래 목록으로"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h2 className="text-base font-semibold">여러 건 입력</h2>
          <p className="text-sm text-muted-foreground">지출·수입·이체·환불을 표에 이어서 입력하고 한 번에 저장합니다. 이체는 카테고리 칸에 받는 계좌를, 환불은 지출 카테고리를 입력하세요.</p>
        </div>
      </div>
      <BulkEntryGrid />
    </div>
  );
}
