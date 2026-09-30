import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "페이지를 찾을 수 없습니다",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-semibold text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground mt-4">
          페이지를 찾을 수 없습니다
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1 mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
