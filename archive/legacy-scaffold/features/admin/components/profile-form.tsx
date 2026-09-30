"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ProfileForm() {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">이름</Label>
        <Input id="profile-name" defaultValue="Kyod" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">이메일</Label>
        <Input
          id="profile-email"
          type="email"
          defaultValue="kyod@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-bio">소개</Label>
        <Textarea
          id="profile-bio"
          defaultValue="풀스택 개발자. Next.js, TypeScript, Supabase를 활용한 웹 애플리케이션 개발에 집중하고 있습니다."
          rows={4}
        />
      </div>
      <div className="mt-6">
        <Button type="submit">저장</Button>
      </div>
    </form>
  );
}
