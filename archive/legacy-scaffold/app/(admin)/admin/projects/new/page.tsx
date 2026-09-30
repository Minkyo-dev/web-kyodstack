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
  title: "새 프로젝트",
  robots: { index: false },
};

export default function AdminNewProjectPage() {
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
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold mt-4 mb-6">새 프로젝트</h1>

      <div className="bg-background rounded-lg border border-border p-6">
        <form className="space-y-4">
          <div>
            <Label htmlFor="title" className="mb-1.5">
              제목
            </Label>
            <Input id="title" placeholder="프로젝트 제목" />
          </div>

          <div>
            <Label htmlFor="slug" className="mb-1.5">
              Slug
            </Label>
            <Input id="slug" placeholder="project-slug" />
          </div>

          <div>
            <Label htmlFor="summary" className="mb-1.5">
              요약
            </Label>
            <Input id="summary" placeholder="프로젝트 한 줄 요약" />
          </div>

          <div>
            <Label htmlFor="content" className="mb-1.5">
              내용
            </Label>
            <Textarea id="content" rows={8} placeholder="프로젝트 상세 내용" />
          </div>

          <div>
            <Label htmlFor="tech_stack" className="mb-1.5">
              기술 스택
            </Label>
            <Input id="tech_stack" placeholder="쉼표로 구분" />
          </div>

          <div>
            <Label htmlFor="cover_image_url" className="mb-1.5">
              커버 이미지 URL
            </Label>
            <Input id="cover_image_url" placeholder="https://..." />
          </div>

          <div>
            <Label htmlFor="demo_url" className="mb-1.5">
              데모 URL
            </Label>
            <Input id="demo_url" placeholder="https://..." />
          </div>

          <div>
            <Label htmlFor="github_url" className="mb-1.5">
              GitHub URL
            </Label>
            <Input id="github_url" placeholder="https://github.com/..." />
          </div>

          <FormSwitch id="is_published" label="게시 여부" />
          <FormSwitch id="is_featured" label="주요 프로젝트" />

          <div className="mt-6">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
