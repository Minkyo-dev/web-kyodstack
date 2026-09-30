import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ─── Metadata ─────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Projects",
};

/* ─── Mock Data ─────────────────────────────────────────────────── */

const PROJECTS = [
  {
    slug: "realtime-dashboard",
    title: "Realtime Dashboard",
    excerpt:
      "WebSocket 기반 실시간 모니터링 대시보드. 초당 수천 건의 이벤트를 지연 없이 시각화합니다.",
    techStack: ["Next.js", "Supabase", "D3"],
  },
  {
    slug: "markdown-editor",
    title: "Markdown Editor",
    excerpt:
      "개발자를 위한 경량 마크다운 에디터. 실시간 프리뷰와 커스텀 신택스 하이라이팅을 지원합니다.",
    techStack: ["React", "TypeScript", "CodeMirror"],
  },
  {
    slug: "finance-tracker",
    title: "Finance Tracker",
    excerpt:
      "개인 재무 관리 도구. 수입과 지출을 카테고리별로 추적하고 월간 리포트를 생성합니다.",
    techStack: ["Next.js", "Postgres", "Chart.js"],
  },
  {
    slug: "cli-tool-kit",
    title: "CLI Tool Kit",
    excerpt:
      "생산성을 높이는 CLI 도구 모음. 프로젝트 스캐폴딩부터 코드 생성까지 반복 작업을 자동화합니다.",
    techStack: ["Node.js", "TypeScript", "Commander"],
  },
  {
    slug: "design-system",
    title: "Design System",
    excerpt:
      "일관된 UI를 위한 컴포넌트 라이브러리. 토큰 기반 디자인 시스템과 문서화를 포함합니다.",
    techStack: ["React", "Storybook", "Tailwind"],
  },
  {
    slug: "api-gateway",
    title: "API Gateway",
    excerpt:
      "마이크로서비스 간 통신을 관리하는 API 게이트웨이. 인증, 라우팅, 속도 제한을 처리합니다.",
    techStack: ["Go", "gRPC", "Redis"],
  },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function ProjectsPage() {
  return (
    <section className="pt-24 pb-24">
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <h1 className="text-4xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          직접 설계하고 구현한 프로젝트들을 모아두었습니다.
        </p>

        {/* Project Grid */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((project) => (
            <Link key={project.slug} href={`/projects/${project.slug}`}>
              <Card className="group cursor-pointer border-border/50 bg-card transition-colors duration-200 hover:border-border">
                <div className="aspect-video rounded-t-lg bg-muted" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium">
                    {project.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {project.excerpt}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {project.techStack.map((tech) => (
                      <Badge
                        key={tech}
                        variant="secondary"
                        className="text-xs font-medium"
                      >
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
