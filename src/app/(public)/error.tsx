"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center text-center">
        <CircleAlert className="h-10 w-10 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
        <p className="text-sm text-muted-foreground mt-2">
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors mt-6"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground mt-4"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
