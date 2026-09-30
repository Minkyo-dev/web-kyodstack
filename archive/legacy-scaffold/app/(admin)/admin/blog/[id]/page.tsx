import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "포스트 편집",
  robots: { index: false },
};

const mockPost = {
  id: "1",
  title: "Next.js 16 마이그레이션 가이드",
  slug: "nextjs-16-migration-guide",
  summary: "Next.js 16으로 마이그레이션하면서 알게 된 주요 변경사항을 정리합니다.",
  content:
    "## 소개\n\nNext.js 16은 여러 가지 중요한 변경사항을 포함하고 있습니다.\n\n## 주요 변경사항\n\n- 비동기 params와 searchParams\n- 새로운 캐싱 전략\n- Turbopack 기본 활성화",
  tags: "Next.js, Migration",
  cover_image_url: "",
  is_published: true,
};

export default async function AdminBlogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // In production, fetch post by id from the database
  const post = { ...mockPost, id };

  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin" />}>
              Admin
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/blog" />}>
              Blog
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold mt-4 mb-6">포스트 편집</h1>

      <form className="space-y-4">
        <div>
          <Label htmlFor="title" className="mb-1.5">
            제목
          </Label>
          <Input
            id="title"
            name="title"
            defaultValue={post.title}
          />
        </div>

        <div>
          <Label htmlFor="slug" className="mb-1.5">
            슬러그
          </Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={post.slug}
          />
        </div>

        <div>
          <Label htmlFor="summary" className="mb-1.5">
            요약
          </Label>
          <Input
            id="summary"
            name="summary"
            defaultValue={post.summary}
          />
        </div>

        <div>
          <Label htmlFor="content" className="mb-1.5">
            내용
          </Label>
          <Textarea
            id="content"
            name="content"
            rows={12}
            defaultValue={post.content}
          />
        </div>

        <div>
          <Label htmlFor="tags" className="mb-1.5">
            태그
          </Label>
          <Input
            id="tags"
            name="tags"
            defaultValue={post.tags}
            placeholder="쉼표로 구분"
          />
        </div>

        <div>
          <Label htmlFor="cover_image_url" className="mb-1.5">
            커버 이미지 URL
          </Label>
          <Input
            id="cover_image_url"
            name="cover_image_url"
            defaultValue={post.cover_image_url}
            placeholder="https://..."
          />
        </div>

        <div>
          <Label className="mb-1.5">게시 상태</Label>
          <FormSwitch
            id="is_published"
            name="is_published"
            label="게시됨"
            defaultChecked={post.is_published}
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            저장
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            삭제
          </button>
        </div>
      </form>
    </div>
  );
}
