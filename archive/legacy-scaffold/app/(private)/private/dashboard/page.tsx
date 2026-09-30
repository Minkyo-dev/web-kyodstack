import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

const stats = [
  { label: "프로젝트", value: "6" },
  { label: "블로그 포스트", value: "12" },
  { label: "이력서", value: "3" },
];

const activities = [
  { action: "프로젝트 'Realtime Dashboard' 수정", time: "2시간 전" },
  { action: "블로그 포스트 게시", time: "5시간 전" },
  { action: "이력서 v3 저장", time: "1일 전" },
  { action: "프로젝트 'Portfolio Site' 추가", time: "2일 전" },
  { action: "블로그 포스트 초안 작성", time: "3일 전" },
];

export const metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-3xl font-mono font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium mb-4">최근 활동</h2>
        <div className="divide-y divide-border">
          {activities.map((activity, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground">{activity.action}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                {activity.time}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
