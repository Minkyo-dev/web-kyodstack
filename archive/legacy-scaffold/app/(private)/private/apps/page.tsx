import Link from "next/link";
import { Wallet, StickyNote, Bookmark } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "앱",
  robots: { index: false, follow: false },
};

const apps = [
  {
    slug: "finance-tracker",
    title: "Finance Tracker",
    description: "수입과 지출을 추적하고 월간 리포트를 생성합니다.",
    icon: Wallet,
  },
  {
    slug: "note-pad",
    title: "Note Pad",
    description: "빠른 메모와 스니펫을 저장합니다.",
    icon: StickyNote,
  },
  {
    slug: "bookmark-manager",
    title: "Bookmark Manager",
    description: "유용한 링크를 카테고리별로 관리합니다.",
    icon: Bookmark,
  },
];

export default function AppsListPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">앱</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {apps.map((app) => (
          <Link key={app.slug} href={`/private/apps/${app.slug}`}>
            <Card className="border-border/50 hover:border-border transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="bg-muted rounded-md h-10 w-10 flex items-center justify-center">
                    <app.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base font-medium">
                    {app.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{app.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
