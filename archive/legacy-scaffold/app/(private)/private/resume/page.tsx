import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "이력서",
  robots: { index: false, follow: false },
};

const resumes = [
  {
    id: "1",
    title: "프론트엔드 개발자 이력서",
    updatedAt: "2026-03-20",
    isLatest: true,
  },
  {
    id: "2",
    title: "풀스택 개발자 이력서",
    updatedAt: "2026-03-01",
    isLatest: false,
  },
  {
    id: "3",
    title: "기술 리더 이력서",
    updatedAt: "2026-02-15",
    isLatest: false,
  },
];

export default function ResumeListPage() {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">이력서</h1>
        <Link
          href="/private/resume/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="h-4 w-4 mr-2" />
          새 이력서
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {resumes.map((resume) => (
          <Link key={resume.id} href={`/private/resume/${resume.id}`}>
            <Card className="border-border/50 hover:border-border transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base font-medium">
                    {resume.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {resume.updatedAt}
                  </span>
                  {resume.isLatest && (
                    <Badge variant="secondary">최신</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
