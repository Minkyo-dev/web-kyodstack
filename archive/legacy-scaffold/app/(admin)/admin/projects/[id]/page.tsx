import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSwitch } from "@/features/admin/components/form-switch";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "프로젝트 편집",
  robots: { index: false },
};

const mockProject = {
  id: "1",
  title: "포트폴리오 사이트 리뉴얼",
  slug: "portfolio-site-renewal",
  summary: "Next.js App Router와 Supabase를 활용한 개인 포트폴리오 사이트",
  content:
    "이 프로젝트는 개인 포트폴리오 사이트를 Next.js App Router와 Supabase를 사용하여 재구축한 프로젝트입니다. 서버 컴포넌트, ISR, RLS 등을 활용하여 빠르고 안전한 사이트를 구현했습니다.",
  tech_stack: "Next.js, TypeScript, Tailwind CSS, Supabase",
  cover_image_url: "https://example.com/cover.jpg",
  demo_url: "https://kyod.dev",
  github_url: "https://github.com/kyod/portfolio",
  is_published: true,
  is_featured: true,
};

export default async function AdminEditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin" />}>
              Admin
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/projects" />}>
              Projects
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold mt-4 mb-6">프로젝트 편집</h1>

      <div className="bg-background rounded-lg border border-border p-6">
        <form className="space-y-4">
          <input type="hidden" name="id" value={id} />

          <div>
            <Label htmlFor="title" className="mb-1.5">
              제목
            </Label>
            <Input
              id="title"
              placeholder="프로젝트 제목"
              defaultValue={mockProject.title}
            />
          </div>

          <div>
            <Label htmlFor="slug" className="mb-1.5">
              Slug
            </Label>
            <Input
              id="slug"
              placeholder="project-slug"
              defaultValue={mockProject.slug}
            />
          </div>

          <div>
            <Label htmlFor="summary" className="mb-1.5">
              요약
            </Label>
            <Input
              id="summary"
              placeholder="프로젝트 한 줄 요약"
              defaultValue={mockProject.summary}
            />
          </div>

          <div>
            <Label htmlFor="content" className="mb-1.5">
              내용
            </Label>
            <Textarea
              id="content"
              rows={8}
              placeholder="프로젝트 상세 내용"
              defaultValue={mockProject.content}
            />
          </div>

          <div>
            <Label htmlFor="tech_stack" className="mb-1.5">
              기술 스택
            </Label>
            <Input
              id="tech_stack"
              placeholder="쉼표로 구분"
              defaultValue={mockProject.tech_stack}
            />
          </div>

          <div>
            <Label htmlFor="cover_image_url" className="mb-1.5">
              커버 이미지 URL
            </Label>
            <Input
              id="cover_image_url"
              placeholder="https://..."
              defaultValue={mockProject.cover_image_url}
            />
          </div>

          <div>
            <Label htmlFor="demo_url" className="mb-1.5">
              데모 URL
            </Label>
            <Input
              id="demo_url"
              placeholder="https://..."
              defaultValue={mockProject.demo_url}
            />
          </div>

          <div>
            <Label htmlFor="github_url" className="mb-1.5">
              GitHub URL
            </Label>
            <Input
              id="github_url"
              placeholder="https://github.com/..."
              defaultValue={mockProject.github_url}
            />
          </div>

          <FormSwitch
            id="is_published"
            label="게시 여부"
            defaultChecked={mockProject.is_published}
          />
          <FormSwitch
            id="is_featured"
            label="주요 프로젝트"
            defaultChecked={mockProject.is_featured}
          />

          <div className="mt-6 flex items-center gap-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              저장
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              삭제
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
