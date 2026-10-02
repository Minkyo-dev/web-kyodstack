import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/auth";
import { PlannerManual } from "@/features/manual/components/planner-manual";

export const metadata: Metadata = { title: "매뉴얼", robots: { index: false } };

export default async function ManualPage() {
  await requireUserOrRedirect();
  return <PlannerManual />;
}
