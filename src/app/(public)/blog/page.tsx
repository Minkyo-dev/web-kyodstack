import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/* ─── Metadata ─────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Blog",
};

/* ─── Mock Data ─────────────────────────────────────────────────── */

const BLOG_POSTS = [
  {
    slug: "building-with-nextjs-16",
    title: "Next.js 16으로 마이그레이션하며 배운 것들",
    excerpt:
      "proxy.ts, 비동기 Request API, Cache Components 등 주요 변경 사항과 실제 마이그레이션 경험을 정리합니다.",
    publishedAt: "2026-03-15",
    tags: ["Next.js", "Migration"],
  },
  {
    slug: "supabase-rls-patterns",
    title: "Supabase RLS 실전 패턴 정리",
    excerpt:
      "Row Level Security 정책을 설계할 때 자주 만나는 패턴과 실수를 사례 중심으로 살펴봅니다.",
    publishedAt: "2026-03-10",
    tags: ["Supabase", "Security"],
  },
  {
    slug: "typescript-type-narrowing",
    title: "TypeScript 타입 좁히기 완벽 가이드",
    excerpt:
      "typeof, instanceof, in, 사용자 정의 타입 가드까지 — 타입 좁히기의 모든 기법을 다룹니다.",
    publishedAt: "2026-03-01",
    tags: ["TypeScript"],
  },
  {
    slug: "tailwind-css-v4-features",
    title: "Tailwind CSS v4의 새로운 기능들",
    excerpt:
      "새로운 엔진, CSS-first 설정, 컨테이너 쿼리 지원 등 v4에서 달라진 점을 실습과 함께 알아봅니다.",
    publishedAt: "2026-02-20",
    tags: ["CSS", "Tailwind"],
  },
  {
    slug: "understanding-server-components",
    title: "Server Components 깊이 이해하기",
    excerpt:
      "React Server Components의 동작 원리와 클라이언트 컴포넌트와의 경계를 실제 코드로 분석합니다.",
    publishedAt: "2026-02-10",
    tags: ["React", "Next.js"],
  },
  {
    slug: "personal-project-cicd",
    title: "개인 프로젝트를 위한 CI/CD 파이프라인",
    excerpt:
      "GitHub Actions를 활용해 린트, 테스트, 배포까지 자동화하는 파이프라인을 단계별로 구축합니다.",
    publishedAt: "2026-01-28",
    tags: ["DevOps", "GitHub Actions"],
  },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function BlogPage() {
  return (
    <section className="pb-24">
      {/* Page Header */}
      <div className="mx-auto max-w-screen-xl px-4 pt-24 pb-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight">Blog</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          개발하며 배운 것들을 기록하고 공유합니다.
        </p>
      </div>

      {/* Post List */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="divide-y divide-border rounded-lg border border-border">
          {BLOG_POSTS.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block px-6 py-5 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-base font-medium text-foreground">
                  {post.title}
                </h2>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {post.publishedAt}
                </time>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {post.excerpt}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs font-medium"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
