import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";

/** Home: what today's session holds (spec §10 홈). */
export function TodayCard({ reviews, fresh }: { reviews: number; fresh: number }) {
  const total = reviews + fresh;
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-3">
        <GraduationCap className="size-6 text-primary" aria-hidden />
        <div>
          <h2 className="font-semibold">오늘의 복습</h2>
          <p className="text-sm text-muted-foreground">
            복습 {reviews} · 새 단어 {fresh}
          </p>
        </div>
      </div>
      {total > 0 ? (
        <Link href="/english/review" className={buttonVariants({ size: "lg" })}>
          복습 시작
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">오늘 할 복습을 모두 마쳤어요.</p>
      )}
    </section>
  );
}
