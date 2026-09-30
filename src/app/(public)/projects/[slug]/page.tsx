import Link from "next/link";
import { ArrowLeft, ExternalLink, FolderGit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

/* ─── Mock Data ─────────────────────────────────────────────────── */

const PROJECT = {
  title: "Realtime Dashboard",
  techStack: ["Next.js", "Supabase", "D3", "WebSocket"],
  demoUrl: "#",
  githubUrl: "#",
};

/* ─── Metadata ──────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await params;
  return {
    title: `${PROJECT.title} — Projects`,
  };
}

/* ─── Page ──────────────────────────────────────────────────────── */

export default async function ProjectDetailPage({
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
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4 inline" />
          Projects
        </Link>
      </div>

      {/* Cover image */}
      <div className="mt-8 aspect-[3/1] w-full rounded-lg bg-muted" />

      {/* Title */}
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">
        {PROJECT.title}
      </h1>

      {/* Meta row */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {PROJECT.techStack.map((tech) => (
            <Badge key={tech} variant="secondary" className="text-xs font-medium">
              {tech}
            </Badge>
          ))}
        </div>
        <a
          href={PROJECT.demoUrl}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Demo
          <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={PROJECT.githubUrl}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
          <FolderGit2 className="h-4 w-4" />
        </a>
      </div>

      {/* Content body */}
      <div className="mt-12 max-w-prose">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          이 프로젝트는 WebSocket을 활용하여 초당 수천 건의 이벤트를 실시간으로
          수집하고 시각화하는 대시보드입니다. 기존의 폴링 방식이 가진 지연과
          서버 부하 문제를 해결하기 위해 양방향 통신 채널을 도입했으며, 브라우저
          측에서는 D3.js를 사용해 데이터를 즉각적으로 차트와 그래프로
          렌더링합니다.
        </p>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          백엔드는 Supabase Realtime을 기반으로 구축되어 있으며, Postgres
          테이블의 변경 사항이 클라이언트에 즉시 반영됩니다. 인증된 사용자만
          대시보드에 접근할 수 있도록 Row Level Security 정책을 적용했고, 각
          사용자에게 할당된 데이터만 스트리밍되도록 채널 필터를 설정했습니다.
        </p>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          프론트엔드는 Next.js App Router 위에서 동작하며, 서버 컴포넌트로 초기
          데이터를 프리페칭한 뒤 클라이언트 컴포넌트에서 실시간 업데이트를
          이어받는 하이브리드 렌더링 전략을 사용합니다. 이를 통해 첫 로드 시
          빈 화면 없이 즉시 의미 있는 데이터를 보여줄 수 있습니다.
        </p>

        <h2 className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground">
          기술적 의사 결정
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          차트 라이브러리 선택 과정에서 Recharts, Chart.js, D3 세 가지를
          비교했습니다. Recharts는 선언적 API가 편리했지만 커스터마이징에
          한계가 있었고, Chart.js는 Canvas 기반이라 SVG 기반 인터랙션이
          제한적이었습니다. 최종적으로 D3를 선택한 이유는 데이터 바인딩과
          트랜지션을 세밀하게 제어할 수 있어 실시간 데이터 스트림에 가장
          적합했기 때문입니다.
        </p>

        <div className="rounded-md bg-muted p-4 font-mono text-sm">
          <pre>{`// WebSocket 연결 및 D3 차트 업데이트 예시
const channel = supabase
  .channel('events')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'events' },
    (payload) => {
      const newPoint = transform(payload.new);
      updateChart(newPoint);
    }
  )
  .subscribe();`}</pre>
        </div>
      </div>
    </div>
  );
}
