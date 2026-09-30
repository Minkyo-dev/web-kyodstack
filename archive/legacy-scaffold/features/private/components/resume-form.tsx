"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function ResumeForm() {
  return (
    <form>
      {/* Basic info */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">이름</Label>
          <Input id="name" placeholder="홍길동" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">전화번호</Label>
          <Input id="phone" placeholder="010-0000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="summary">요약</Label>
          <Textarea id="summary" placeholder="간단한 자기소개를 작성하세요" />
        </div>
      </div>

      {/* Experience */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">경력</h2>
          <Button type="button" variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        </div>
        <div className="divide-y divide-border">
          {/* Experience item 1 */}
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exp-company-1">회사</Label>
              <Input id="exp-company-1" defaultValue="ABC 테크놀로지" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-position-1">직책</Label>
              <Input id="exp-position-1" defaultValue="시니어 프론트엔드 개발자" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-period-1">기간</Label>
              <Input id="exp-period-1" defaultValue="2023.03 - 현재" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc-1">설명</Label>
              <Textarea
                id="exp-desc-1"
                rows={2}
                defaultValue="Next.js 기반 제품 개발 및 디자인 시스템 구축"
              />
            </div>
          </div>
          {/* Experience item 2 */}
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exp-company-2">회사</Label>
              <Input id="exp-company-2" defaultValue="XYZ 스타트업" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-position-2">직책</Label>
              <Input id="exp-position-2" defaultValue="프론트엔드 개발자" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-period-2">기간</Label>
              <Input id="exp-period-2" defaultValue="2021.01 - 2023.02" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc-2">설명</Label>
              <Textarea
                id="exp-desc-2"
                rows={2}
                defaultValue="React SPA 개발 및 성능 최적화"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Education */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">학력</h2>
          <Button type="button" variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        </div>
        <div className="divide-y divide-border">
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edu-school-1">학교</Label>
              <Input id="edu-school-1" defaultValue="서울대학교" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edu-degree-1">학위</Label>
              <Input id="edu-degree-1" defaultValue="컴퓨터공학 학사" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edu-period-1">기간</Label>
              <Input id="edu-period-1" defaultValue="2017.03 - 2021.02" />
            </div>
          </div>
        </div>
      </div>

      <Button type="submit" className="mt-8">
        저장
      </Button>
    </form>
  );
}
