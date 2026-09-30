import Link from "next/link";
import { Mail, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

/* ─── Mock Data ─────────────────────────────────────────────────── */

const PROFILE = {
  name: "Kyod",
  initials: "KY",
  intro:
    "사용자를 위한 제품을 만드는 소프트웨어 엔지니어입니다.",
};

const CAREER_ITEMS = [
  {
    company: "Acme Corp",
    role: "Senior Frontend Engineer",
    period: "2024 — Present",
    description:
      "대규모 SaaS 제품의 프론트엔드 아키텍처를 설계하고 팀 리드로서 코드 리뷰와 기술 의사결정을 담당합니다.",
  },
  {
    company: "Startup Labs",
    role: "Full-Stack Engineer",
    period: "2022 — 2024",
    description:
      "초기 스타트업에서 제품 전반의 개발을 담당하며 Next.js와 Supabase 기반의 서비스를 처음부터 구축했습니다.",
  },
  {
    company: "Digital Agency",
    role: "Frontend Developer",
    period: "2020 — 2022",
    description:
      "다양한 클라이언트 프로젝트에서 React 기반 인터페이스를 개발하고 성능 최적화를 수행했습니다.",
  },
  {
    company: "Tech University",
    role: "Computer Science, B.S.",
    period: "2016 — 2020",
    description:
      "컴퓨터 과학 전공으로 알고리즘, 데이터베이스, 소프트웨어 공학 등을 학습했습니다.",
  },
];

const SKILL_CATEGORIES = [
  {
    label: "Frontend",
    skills: ["React", "Next.js", "TypeScript", "Tailwind CSS"],
  },
  {
    label: "Backend",
    skills: ["Node.js", "Supabase", "PostgreSQL", "REST API"],
  },
  {
    label: "Infrastructure",
    skills: ["Vercel", "Docker", "GitHub Actions", "Cloudflare"],
  },
];

const CONTACT_LINKS = [
  {
    label: "hello@kyod.dev",
    href: "mailto:hello@kyod.dev",
    icon: Mail,
  },
  {
    label: "github.com/kyod",
    href: "https://github.com/kyod",
    icon: ExternalLink,
  },
];

/* ─── Page ──────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <>
      {/* Profile */}
      <section className="pt-24 pb-16 sm:pb-20">
        <div className="mx-auto max-w-screen-lg px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src="" alt={PROFILE.name} />
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                {PROFILE.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold">{PROFILE.name}</h1>
              <p className="mt-1 text-muted-foreground">{PROFILE.intro}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Experience */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-screen-lg px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Experience</h2>
          <div className="mt-6 space-y-8 border-l-2 border-border pl-6">
            {CAREER_ITEMS.map((item) => (
              <div key={item.company}>
                <p className="font-medium">{item.company}</p>
                <p className="text-muted-foreground">{item.role}</p>
                <p className="text-xs text-muted-foreground">{item.period}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto max-w-screen-lg px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Skills</h2>
          <div className="mt-6 space-y-6">
            {SKILL_CATEGORIES.map((category) => (
              <div key={category.label}>
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {category.label}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {category.skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto max-w-screen-lg px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Contact</h2>
          <div className="mt-6 flex flex-col gap-3">
            {CONTACT_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
