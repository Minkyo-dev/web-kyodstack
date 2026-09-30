import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

/* ─── Mock Data ─────────────────────────────────────────────────── */

const POST = {
  title: "Next.js 16 마이그레이션 가이드",
  date: "2026-03-15",
  tags: ["Next.js", "React", "마이그레이션"],
};

/* ─── Metadata ──────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await params;
  return {
    title: `${POST.title} — Blog`,
  };
}

/* ─── Page ──────────────────────────────────────────────────────── */

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: _slug } = await params;

  return (
    <div className="mx-auto max-w-screen-xl px-4 pb-24 sm:px-6 lg:px-8">
      {/* Back link */}
      <div className="pt-24">
        <Link
          href="/blog"
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4 inline" />
          Blog
        </Link>
      </div>

      {/* Title */}
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {POST.title}
      </h1>

      {/* Meta row */}
      <div className="mt-4 flex items-center gap-4">
        <time className="text-sm text-muted-foreground">{POST.date}</time>
        <div className="flex flex-wrap gap-1.5">
          {POST.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-medium">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content body */}
      <div className="mt-12 max-w-prose">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Next.js 16이 정식 릴리스되면서 App Router 기반 프로젝트에 여러 가지
          중요한 변경 사항이 도입되었습니다. 이 글에서는 기존 Next.js 15
          프로젝트를 16으로 마이그레이션하면서 겪은 실제 경험과 주의할 점을
          공유합니다. 특히 비동기 API 변경, 새로운 캐싱 전략, 그리고 프록시
          미들웨어 전환에 초점을 맞추었습니다.
        </p>

        <h2 className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground">
          비동기 params와 searchParams
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Next.js 16에서 가장 먼저 체감하게 되는 변경 사항은 params와
          searchParams가 Promise로 감싸졌다는 점입니다. 기존에는 동기적으로
          접근할 수 있었던 이 값들이 이제는 반드시 await를 통해 풀어야 합니다.
          이 변경은 서버 컴포넌트의 스트리밍 렌더링을 더 유연하게 만들기 위한
          아키텍처적 결정이며, 모든 페이지 컴포넌트와 generateMetadata 함수에
          영향을 미칩니다.
        </p>

        <div className="mb-6 rounded-md bg-muted p-4 font-mono text-sm">
          <pre>{`// Before (Next.js 15)
export default function Page({ params }: { params: { slug: string } }) {
  const { slug } = params;
  return <div>{slug}</div>;
}

// After (Next.js 16)
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <div>{slug}</div>;
}`}</pre>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          이 패턴은 단순히 타입을 바꾸는 것 이상의 의미를 가집니다. 기존에
          동기적으로 params에 접근하던 유틸리티 함수나 헬퍼가 있다면 모두
          비동기로 전환해야 하며, 이 과정에서 호출 체인 전체를 점검해야 합니다.
          Codemod를 활용하면 대부분의 변환을 자동화할 수 있지만, 커스텀
          래퍼에서는 수동 확인이 필요합니다.
        </p>

        <h2 className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground">
          캐싱 전략의 변화
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Next.js 16에서는 기존의 unstable_cache가 공식적으로 use cache
          디렉티브로 대체되었습니다. 이전에는 fetch 함수에 캐싱 옵션을
          전달하거나 unstable_cache로 감싸야 했던 패턴이 이제는 함수 레벨에서
          선언적으로 캐싱을 지정할 수 있게 되었습니다. 이는 코드의 가독성을
          크게 향상시키며, 캐싱 의도를 명확하게 표현할 수 있습니다.
        </p>

        <blockquote className="mb-6 border-l-2 border-border pl-4 text-muted-foreground italic">
          캐싱은 성능 최적화의 핵심이지만, 잘못된 캐싱은 디버깅하기 가장 어려운
          버그의 원인이 됩니다. 명시적인 캐싱 선언은 이 문제를 해결하는 첫
          걸음입니다.
        </blockquote>

        <h3 className="mt-8 mb-3 text-xl font-medium text-foreground">
          태그 기반 무효화
        </h3>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          캐시 무효화 역시 개선되었습니다. cacheTag를 사용하여 캐시된 데이터에
          태그를 부여하고, 콘텐츠가 변경될 때 updateTag로 특정 태그에 해당하는
          캐시만 선택적으로 무효화할 수 있습니다. 이전의 revalidateTag와 유사한
          개념이지만, use cache 디렉티브와 자연스럽게 통합되어 훨씬 직관적인
          워크플로를 제공합니다.
        </p>

        <div className="mb-6 rounded-md bg-muted p-4 font-mono text-sm">
          <pre>{`// use cache와 cacheTag 활용 예시
async function getPublishedPosts() {
  'use cache';
  cacheTag('blog-posts');
  cacheLife('hours');

  const posts = await db.query('SELECT * FROM posts WHERE published = true');
  return posts;
}

// 콘텐츠 변경 시 무효화
async function publishPost(id: string) {
  await db.update('posts', { id, published: true });
  updateTag('blog-posts');
}`}</pre>
        </div>

        <h2 className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground">
          미들웨어에서 프록시로
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Next.js 16에서는 기존의 middleware.ts가 proxy.ts로 리네이밍되었습니다.
          이 변경은 단순한 이름 변경이 아니라, 해당 파일의 역할을 더 정확하게
          반영하기 위한 것입니다. 프록시는 들어오는 요청을 가로채어 리다이렉트,
          리라이트, 헤더 수정 등을 수행하며, 기존 미들웨어와 동일한 기능을
          제공하지만 명칭이 실제 동작과 더 잘 부합합니다. 마이그레이션은
          파일명을 변경하고 임포트를 업데이트하는 것만으로 완료됩니다.
        </p>
      </div>
    </div>
  );
}
