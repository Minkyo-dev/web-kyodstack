import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Private",
  robots: { index: false },
};

export default function PrivateLandingPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <Lock className="mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">비공개 영역</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        이 영역은 인증된 사용자만 접근할 수 있습니다.
      </p>
      <Link
        href="/private/login"
        className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
      >
        로그인
      </Link>
    </div>
  );
}
