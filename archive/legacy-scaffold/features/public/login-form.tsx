"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

export function LoginForm() {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <Button type="submit" className="mt-4 w-full">
        <Mail className="mr-2 h-4 w-4" />
        로그인 링크 보내기
      </Button>
    </form>
  );
}
