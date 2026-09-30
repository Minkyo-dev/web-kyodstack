import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "프로젝트 관리",
  robots: { index: false },
};

const mockProjects = [
  {
    id: "1",
    title: "포트폴리오 사이트 리뉴얼",
    is_published: true,
    is_featured: true,
    created_at: "2026-03-20",
  },
  {
    id: "2",
    title: "개인 금융 트래커",
    is_published: true,
    is_featured: false,
    created_at: "2026-03-12",
  },
  {
    id: "3",
    title: "실시간 채팅 애플리케이션",
    is_published: false,
    is_featured: false,
    created_at: "2026-03-05",
  },
  {
    id: "4",
    title: "AI 기반 코드 리뷰 도구",
    is_published: true,
    is_featured: true,
    created_at: "2026-02-28",
  },
  {
    id: "5",
    title: "마크다운 블로그 엔진",
    is_published: false,
    is_featured: false,
    created_at: "2026-02-15",
  },
];

export default function AdminProjectsPage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">프로젝트 관리</h1>
        <Link
          href="/admin/projects/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
              제목
            </TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
              상태
            </TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
              주요
            </TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
              날짜
            </TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
              액션
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockProjects.map((project) => (
            <TableRow
              key={project.id}
              className="border-border hover:bg-muted/50 transition-colors"
            >
              <TableCell className="text-sm">{project.title}</TableCell>
              <TableCell>
                <Badge
                  variant={project.is_published ? "secondary" : "outline"}
                >
                  {project.is_published ? "게시됨" : "초안"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={project.is_featured ? "secondary" : "outline"}
                >
                  {project.is_featured ? "주요" : "-"}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {project.created_at}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/projects/${project.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  편집
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
