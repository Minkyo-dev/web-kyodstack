import type { Metadata } from "next";
import { PageHelp } from "@/components/layout/page-help";
import { requireUserOrRedirect } from "@/lib/auth";
import { EnglishNav } from "@/features/vocab/components/english-nav";

export const metadata: Metadata = { title: "단어장", robots: { index: false } };

/** 단어장 shell (ADR 0046): title, help and tabs. */
export default async function EnglishLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();
  return (
    <>
      <header className="border-b border-border px-2 pt-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 px-2 sm:px-0">
          <h1 className="text-lg font-semibold">단어장</h1>
          <PageHelp page="english" />
        </div>
        <div className="h-10">
          <EnglishNav />
        </div>
      </header>
      <div className="space-y-4 p-4 md:p-6">{children}</div>
    </>
  );
}
