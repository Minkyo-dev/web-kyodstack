import type { Metadata } from "next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteForm } from "@/features/admin/components/invite-form";

export const metadata: Metadata = {
  title: "접근 관리",
  robots: { index: false },
};

const accessGrants = [
  {
    user: "user1@example.com",
    resource: "/private/resume",
    grantedBy: "admin@kyod.dev",
    date: "2026-03-20",
  },
  {
    user: "user2@example.com",
    resource: "/private/apps",
    grantedBy: "admin@kyod.dev",
    date: "2026-03-15",
  },
  {
    user: "user3@example.com",
    resource: "/private/dashboard",
    grantedBy: "admin@kyod.dev",
    date: "2026-03-10",
  },
];

export default function AccessManagementPage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <h1 className="text-2xl font-semibold mb-6">접근 관리</h1>

      {/* Invite token creation */}
      <section>
        <h2 className="text-lg font-medium mb-4">초대 토큰 생성</h2>
        <InviteForm />
      </section>

      {/* Access grants list */}
      <section>
        <h2 className="text-lg font-medium mt-8 mb-4">접근 권한 목록</h2>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                사용자
              </TableHead>
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                리소스
              </TableHead>
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
                부여자
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
            {accessGrants.map((grant) => (
              <TableRow
                key={grant.user}
                className="border-border hover:bg-muted/50 transition-colors"
              >
                <TableCell className="text-sm">{grant.user}</TableCell>
                <TableCell className="text-sm font-mono text-muted-foreground">
                  {grant.resource}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {grant.grantedBy}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {grant.date}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-destructive hover:text-destructive/80 cursor-pointer">
                    삭제
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
