import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/public/components/login-form";

export const metadata: Metadata = {
  title: "로그인",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>이메일로 로그인 링크를 받습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        홈으로
      </Link>
    </div>
  );
}
