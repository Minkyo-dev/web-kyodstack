import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "대시보드", robots: { index: false } };

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">대시보드</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link
            href="/scheduler"
            className="block rounded-lg border border-border p-4 hover:bg-muted"
          >
            <p className="font-medium">Work Scheduler</p>
            <p className="mt-1 text-sm text-muted-foreground">
              계획 → 실행 → 기록 → 회고
            </p>
          </Link>
        </li>
        <li>
          <Link
            href="/finance"
            className="block rounded-lg border border-border p-4 hover:bg-muted"
          >
            <p className="font-medium">가계부</p>
            <p className="mt-1 text-sm text-muted-foreground">
              우리 집 돈의 흐름 → 날짜 → 거래
            </p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
