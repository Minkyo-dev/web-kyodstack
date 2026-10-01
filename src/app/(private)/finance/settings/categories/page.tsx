import type { Metadata } from "next";
import { CategorySettings } from "@/features/finance/components/category-settings";

export const metadata: Metadata = { title: "카테고리 설정", robots: { index: false } };

export default function FinanceCategoriesPage() {
  return <CategorySettings />;
}
