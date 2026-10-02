import { PlannerNav } from "@/components/layout/planner-nav";

/** Planner shell: scheduler, direction, projects, weekly review and progress as tabs. */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="h-10 border-b border-border px-2 sm:px-4 md:px-6">
        <PlannerNav />
      </header>
      {children}
    </>
  );
}
