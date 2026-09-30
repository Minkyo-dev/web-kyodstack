import Link from "next/link";
import { ArrowLeft, Download, Pencil } from "lucide-react";

export const metadata = {
  title: "이력서 상세",
  robots: { index: false, follow: false },
};

const resume = {
  name: "김교동",
  email: "kyod@example.com",
  phone: "010-1234-5678",
  summary:
    "사용자 중심의 웹 애플리케이션을 설계하고 구현하는 프론트엔드 개발자입니다. 복잡한 비즈니스 요구사항을 명확한 인터페이스로 풀어내는 것에 관심이 많습니다.",
  experience: [
    {
      company: "Acme Corp",
      period: "2023 - 현재",
      position: "Senior Frontend Engineer",
      description:
        "대규모 SaaS 플랫폼의 프론트엔드 아키텍처를 설계하고, 디자인 시스템을 구축하여 팀 생산성을 향상시켰습니다.",
    },
    {
      company: "Startup Labs",
      period: "2020 - 2023",
      position: "Frontend Engineer",
      description:
        "React 기반의 B2B 대시보드 제품을 개발하고, 성능 최적화를 통해 초기 로딩 시간을 40% 단축했습니다.",
    },
  ],
  education: [
    {
      school: "서울대학교",
      period: "2016 - 2020",
      degree: "컴퓨터공학 학사",
    },
  ],
};

export default async function ResumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <Link
        href="/private/resume"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        이력서
      </Link>

      <div className="mt-4 flex gap-3">
        <Link
          href={`/private/resume/${id}/export`}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Download className="h-4 w-4 mr-2" />
          PDF 내보내기
        </Link>
        <Link
          href={`/private/resume/${id}/edit`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          <Pencil className="h-4 w-4 mr-2" />
          편집
        </Link>
      </div>

      <div className="mt-8 bg-card border border-border rounded-lg p-8 md:p-12 max-w-2xl">
        <h1 className="text-2xl font-semibold">{resume.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {resume.email} · {resume.phone}
        </p>

        <section className="mt-6">
          <h2 className="text-lg font-medium border-b border-border pb-2">
            소개
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground mt-3">
            {resume.summary}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium border-b border-border pb-2">
            경력
          </h2>
          <div className="mt-4 space-y-6">
            {resume.experience.map((exp) => (
              <div key={exp.company}>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{exp.company}</span>
                  <span className="text-xs text-muted-foreground">
                    {exp.period}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{exp.position}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {exp.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium border-b border-border pb-2">
            학력
          </h2>
          <div className="mt-4 space-y-6">
            {resume.education.map((edu) => (
              <div key={edu.school}>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{edu.school}</span>
                  <span className="text-xs text-muted-foreground">
                    {edu.period}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{edu.degree}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
