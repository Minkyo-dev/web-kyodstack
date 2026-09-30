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
  title: "새 포스트",
  robots: { index: false },
};

export default function AdminBlogNewPage() {
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
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold mt-4 mb-6">새 포스트</h1>

      <form className="space-y-4">
        <div>
          <Label htmlFor="title" className="mb-1.5">
            제목
          </Label>
          <Input id="title" name="title" placeholder="포스트 제목" />
        </div>

        <div>
          <Label htmlFor="slug" className="mb-1.5">
            슬러그
          </Label>
          <Input id="slug" name="slug" placeholder="post-slug" />
        </div>

        <div>
          <Label htmlFor="summary" className="mb-1.5">
            요약
          </Label>
          <Input id="summary" name="summary" placeholder="포스트 요약" />
        </div>

        <div>
          <Label htmlFor="content" className="mb-1.5">
            내용
          </Label>
          <Textarea
            id="content"
            name="content"
            rows={12}
            placeholder="마크다운으로 작성하세요"
          />
        </div>

        <div>
          <Label htmlFor="tags" className="mb-1.5">
            태그
          </Label>
          <Input id="tags" name="tags" placeholder="쉼표로 구분" />
        </div>

        <div>
          <Label htmlFor="cover_image_url" className="mb-1.5">
            커버 이미지 URL
          </Label>
          <Input
            id="cover_image_url"
            name="cover_image_url"
            placeholder="https://..."
          />
        </div>

        <div>
          <Label className="mb-1.5">게시 상태</Label>
          <FormSwitch
            id="is_published"
            name="is_published"
            label="게시됨"
          />
        </div>

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
  );
}
