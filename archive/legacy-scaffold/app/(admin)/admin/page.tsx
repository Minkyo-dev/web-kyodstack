import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const stats = [
  { label: "게시된 프로젝트", value: "4" },
  { label: "게시된 포스트", value: "9" },
  { label: "접근 권한", value: "2" },
];

const recentContent = [
  {
    title: "포트폴리오 사이트 리뉴얼",
    type: "프로젝트",
    status: "게시됨",
    date: "2026-03-20",
  },
  {
    title: "Next.js App Router 심층 분석",
    type: "블로그",
    status: "게시됨",
    date: "2026-03-18",
  },
  {
    title: "Supabase RLS 패턴 정리",
    type: "블로그",
    status: "초안",
    date: "2026-03-15",
  },
  {
    title: "개인 금융 트래커",
    type: "프로젝트",
    status: "게시됨",
    date: "2026-03-12",
  },
  {
    title: "TypeScript 유틸리티 타입 가이드",
    type: "블로그",
    status: "초안",
    date: "2026-03-10",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
            <CardHeader className="pb-4 border-b border-border">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent content table */}
      <div className="mt-8">
        <h2 className="text-lg font-medium mb-4">최근 콘텐츠</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                제목
              </TableHead>
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                유형
              </TableHead>
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                상태
              </TableHead>
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                날짜
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentContent.map((item) => (
              <TableRow
                key={item.title}
                className="border-border hover:bg-muted/50 transition-colors"
              >
                <TableCell className="text-sm">{item.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.type}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={item.status === "게시됨" ? "secondary" : "outline"}
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.date}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
