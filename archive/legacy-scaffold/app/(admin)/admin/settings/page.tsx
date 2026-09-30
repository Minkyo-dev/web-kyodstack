import { SettingsTabs } from "@/features/admin/components/settings-tabs";

export const metadata = {
  title: "설정",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <div className="bg-background rounded-lg border border-border p-6">
      <h1 className="text-2xl font-semibold mb-6">설정</h1>
      <SettingsTabs />
    </div>
  );
}
