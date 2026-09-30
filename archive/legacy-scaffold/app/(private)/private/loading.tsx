import { Skeleton } from "@/components/ui/skeleton";

export default function PrivateLoading() {
  return (
    <div>
      {/* H1 skeleton */}
      <Skeleton className="h-8 w-48 mb-6" />

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg p-6">
            <Skeleton className="h-4 w-20 mb-3" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Activity skeleton */}
      <div className="mt-8">
        <Skeleton className="h-6 w-32 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full mb-2" />
        ))}
      </div>
    </div>
  );
}
