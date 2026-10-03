import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "로그인",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
        <LogoMark className="mb-4 size-10" />
        <h1 className="text-xl font-semibold">로그인</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          개인 도구는 로그인 후 사용할 수 있습니다.
        </p>
        <LoginForm next={next} />
      </div>
      <Link
        href="/"
        className="mt-6 text-sm text-muted-foreground hover:text-foreground"
      >
        ← 홈으로
      </Link>
    </main>
  );
}
