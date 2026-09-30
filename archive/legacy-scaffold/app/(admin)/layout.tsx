import { requireAdmin } from "@/server/auth";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen bg-muted/50">
      <AdminSidebar />
      <main className="flex-1 pt-14 lg:pt-0 lg:pl-64">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
