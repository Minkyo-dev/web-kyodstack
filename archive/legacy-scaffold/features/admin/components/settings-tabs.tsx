"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function SettingsTabs() {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">일반</TabsTrigger>
        <TabsTrigger value="appearance">외관</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <form className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="site-title">사이트 제목</Label>
            <Input
              id="site-title"
              defaultValue="Kyod"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-description">사이트 설명</Label>
            <Textarea
              id="site-description"
              defaultValue="개인 사이트 — 포트폴리오, 블로그, 비공개 도구"
            />
          </div>
          <Button type="submit" className="mt-6">
            저장
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="appearance">
        <div className="space-y-8 mt-6">
          {/* Theme */}
          <div className="space-y-4">
            <Label>테마</Label>
            <div className="flex gap-4">
              {/* Dark mode card - selected */}
              <div className="flex-1 rounded-lg border border-foreground p-4 cursor-pointer">
                <div className="mb-3 h-16 rounded-md bg-zinc-900" />
                <p className="text-sm font-medium">다크 모드</p>
              </div>
              {/* Light mode card - unselected */}
              <div className="flex-1 rounded-lg border border-border p-4 cursor-pointer">
                <div className="mb-3 h-16 rounded-md bg-zinc-200" />
                <p className="text-sm font-medium">라이트 모드</p>
              </div>
            </div>
          </div>

          {/* Accent color */}
          <div className="space-y-4">
            <Label>액센트 컬러</Label>
            <div className="flex gap-3">
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-background"
                aria-label="Indigo"
              />
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-blue-500"
                aria-label="Blue"
              />
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-green-500"
                aria-label="Green"
              />
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-orange-500"
                aria-label="Orange"
              />
            </div>
          </div>

          <Button type="submit">저장</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
