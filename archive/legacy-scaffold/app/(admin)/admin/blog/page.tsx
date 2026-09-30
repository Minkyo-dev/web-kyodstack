import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "블로그 관리",
  robots: { index: false },
};

const posts = [
  {
    id: "1",
    title: "Next.js 16 마이그레이션 가이드",
    status: "게시됨" as const,
    tags: ["Next.js", "Migration"],
    date: "2026-03-15",
  },
  {
    id: "2",
    title: "Supabase RLS 패턴 정리",
    status: "게시됨" as const,
    tags: ["Supabase", "Security"],
    date: "2026-03-10",
  },
  {
    id: "3",
    title: "TypeScript 타입 좁히기",
    status: "게시됨" as const,
    tags: ["TypeScript"],
    date: "2026-03-01",
  },
  {
    id: "4",
    title: "Tailwind CSS v4 정리",
    status: "초안" as const,
    tags: ["CSS", "Tailwind"],
    date: "2026-02-20",
  },
  {
    id: "5",
    title: "Server Components 이해하기",
    status: "초안" as const,
    tags: ["React", "Next.js"],
    date: "2026-02-10",
  },
];

export default function AdminBlogListPage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">블로그 관리</h1>
        <Link
          href="/admin/blog/new"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Post
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              제목
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              상태
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              태그
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              날짜
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              액션
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow
              key={post.id}
              className="border-border hover:bg-muted/50 transition-colors"
            >
              <TableCell className="text-sm">{post.title}</TableCell>
              <TableCell>
                <Badge
                  variant={post.status === "게시됨" ? "secondary" : "outline"}
                >
                  {post.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {post.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {post.date}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/blog/${post.id}`}
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
