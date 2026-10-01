import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4 md:p-6" aria-label="캘린더 불러오는 중">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[480px] w-full" />
    </div>
  );
}
