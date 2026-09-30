"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";

export function GenerateReviewButton({ weekStart, hasReview }: { weekStart: string; hasReview: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={hasReview ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await fetch("/api/ai/weekly-review", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ weekStart }),
          });
          const body = (await res.json().catch(() => null)) as ActionResult<unknown> | null;
          if (!body || !body.ok) {
            toast.error(body && !body.ok ? body.message : "리뷰를 만들지 못했습니다.");
            return;
          }
          toast.success("주간 리뷰를 만들었습니다.");
          router.refresh();
        })
      }
    >
      <Sparkles aria-hidden />
      {pending ? "분석 중… (최대 1분)" : hasReview ? "AI 리뷰 다시 생성" : "AI 리뷰 생성"}
    </Button>
  );
}
