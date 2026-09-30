import Link from "next/link";
import { ArrowLeft, ExternalLink, Wallet, StickyNote, Bookmark } from "lucide-react";
import type { Metadata } from "next";

const apps: Record<
  string,
  {
    title: string;
    description: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
  }
> = {
  "finance-tracker": {
    title: "Finance Tracker",
    description: "수입과 지출을 추적하고 월간 리포트를 생성합니다.",
    detail:
      "Finance Tracker는 개인 재정 관리를 위한 도구입니다. 수입과 지출을 카테고리별로 기록하고, 월간 및 연간 리포트를 통해 소비 패턴을 분석할 수 있습니다. 예산 목표를 설정하고 진행 상황을 실시간으로 확인하세요.",
    icon: Wallet,
    href: "/private/finance",
  },
  "note-pad": {
    title: "Note Pad",
    description: "빠른 메모와 스니펫을 저장합니다.",
    detail:
      "Note Pad는 빠르게 아이디어를 기록하고 코드 스니펫을 저장할 수 있는 경량 메모 도구입니다. 마크다운을 지원하며, 태그를 사용해 메모를 체계적으로 관리할 수 있습니다. 어디서든 빠르게 접근하고 검색할 수 있습니다.",
    icon: StickyNote,
    href: "#",
  },
  "bookmark-manager": {
    title: "Bookmark Manager",
    description: "유용한 링크를 카테고리별로 관리합니다.",
    detail:
      "Bookmark Manager는 웹에서 발견한 유용한 리소스를 체계적으로 정리하는 도구입니다. 카테고리와 태그를 활용해 북마크를 분류하고, 빠른 검색으로 필요한 링크를 즉시 찾을 수 있습니다. 자주 방문하는 링크를 즐겨찾기에 추가해 빠르게 접근하세요.",
    icon: Bookmark,
    href: "#",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const app = apps[slug];

  return {
    title: app?.title ?? "앱",
    robots: { index: false, follow: false },
  };
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = apps[slug];

  if (!app) {
    return (
      <>
        <Link
          href="/private/apps"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          앱
        </Link>
        <p className="text-sm text-muted-foreground mt-6">
          앱을 찾을 수 없습니다.
        </p>
      </>
    );
  }

  const Icon = app.icon;

  return (
    <>
      <Link
        href="/private/apps"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        앱
      </Link>

      <div className="bg-muted rounded-lg h-16 w-16 flex items-center justify-center mt-6">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>

      <h1 className="text-2xl font-semibold mt-4">{app.title}</h1>
      <p className="text-sm text-muted-foreground mt-2">{app.detail}</p>

      <Link
        href={app.href}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 mt-6"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        앱으로 이동
      </Link>
    </>
  );
}
