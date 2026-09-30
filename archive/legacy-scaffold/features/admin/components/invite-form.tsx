"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

export function InviteForm() {
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col sm:flex-row gap-4 items-end"
    >
      <div className="w-full sm:w-auto sm:flex-1 space-y-1.5">
        <Label htmlFor="invite-email">이메일</Label>
        <Input id="invite-email" type="email" placeholder="user@example.com" />
      </div>
      <div className="w-full sm:w-auto space-y-1.5">
        <Label>역할</Label>
        <Select defaultValue="member">
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="역할 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-auto space-y-1.5">
        <Label htmlFor="invite-expiry">만료일</Label>
        <Input id="invite-expiry" type="date" />
      </div>
      <Button type="submit">
        <Plus data-icon="inline-start" className="h-4 w-4" />
        초대 생성
      </Button>
    </form>
  );
}
