import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ─── Mock Data ─────────────────────────────────────────────────── */

const FEATURED_PROJECTS = [
  {
    slug: "realtime-dashboard",
    title: "Realtime Dashboard",
    excerpt:
      "WebSocket 기반 실시간 모니터링 대시보드. 초당 수천 건의 이벤트를 지연 없이 시각화합니다.",
    techStack: ["Next.js", "Supabase", "D3"],
    coverColor: "bg-muted",
  },
  {
    slug: "markdown-editor",
    title: "Markdown Editor",
    excerpt:
      "개발자를 위한 경량 마크다운 에디터. 실시간 프리뷰와 커스텀 신택스 하이라이팅을 지원합니다.",
    techStack: ["React", "TypeScript", "CodeMirror"],
    coverColor: "bg-muted",
  },
  {
    slug: "finance-tracker",
    title: "Finance Tracker",
    excerpt:
      "개인 재무 관리 도구. 수입과 지출을 카테고리별로 추적하고 월간 리포트를 생성합니다.",
    techStack: ["Next.js", "Postgres", "Chart.js"],
    coverColor: "bg-muted",
  },
];

const RECENT_POSTS = [
  {
    slug: "building-with-nextjs-16",
    title: "Next.js 16으로 마이그레이션하며 배운 것들",
    excerpt:
      "proxy.ts, 비동기 Request API, Cache Components 등 주요 변경 사항과 실제 마이그레이션 경험을 정리합니다.",
    publishedAt: "2026-03-15",
  },
  {
    slug: "supabase-rls-patterns",
    title: "Supabase RLS 실전 패턴 정리",
    excerpt:
      "Row Level Security 정책을 설계할 때 자주 만나는 패턴과 실수를 사례 중심으로 살펴봅니다.",
    publishedAt: "2026-03-10",
  },
  {
    slug: "typescript-type-narrowing",
    title: "TypeScript 타입 좁히기 완벽 가이드",
    excerpt:
      "typeof, instanceof, in, 사용자 정의 타입 가드까지 — 타입 좁히기의 모든 기법을 다룹니다.",
    publishedAt: "2026-03-01",
  },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-24 pb-20">
        <div className="mx-auto max-w-screen-xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Software Engineer
          </h1>
          <p className="mx-auto mt-6 max-w-prose text-lg text-muted-foreground">
            사용자를 위한 제품을 만드는 엔지니어입니다.
            <br className="hidden sm:block" />
            깔끔한 구조와 신뢰할 수 있는 코드를 지향합니다.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/projects"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              View Projects
            </Link>
            <Link
              href="/blog"
              className="inline-flex h-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
            >
              Read Blog
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-24">
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">
              Featured Projects
            </h2>
            <Link
              href="/projects"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_PROJECTS.map((project) => (
              <Link key={project.slug} href={`/projects/${project.slug}`}>
                <Card className="group cursor-pointer border-border/50 bg-card transition-colors duration-200 hover:border-border">
                  <div className={`aspect-video rounded-t-lg ${project.coverColor}`} />
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

      {/* Recent Posts */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">
              Recent Posts
            </h2>
            <Link
              href="/blog"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 divide-y divide-border rounded-lg border border-border">
            {RECENT_POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block px-6 py-5 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-base font-medium text-foreground">
                    {post.title}
                  </h3>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {post.publishedAt}
                  </time>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
