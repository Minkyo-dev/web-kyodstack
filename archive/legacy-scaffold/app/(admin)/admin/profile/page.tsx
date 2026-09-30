import type { Metadata } from "next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ProfileForm } from "@/features/admin/components/profile-form";

export const metadata: Metadata = {
  title: "프로필",
  robots: { index: false },
};

export default function ProfilePage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <h1 className="text-2xl font-semibold mb-6">프로필</h1>

      {/* Avatar section */}
      <div className="flex items-center gap-6 mb-8">
        <Avatar className="h-20 w-20">
          <AvatarFallback className="text-lg font-medium">KY</AvatarFallback>
        </Avatar>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2.5 h-8 text-sm font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          이미지 변경
        </button>
      </div>

      {/* Profile form */}
      <ProfileForm />
    </div>
  );
}
