import { requireAuth } from "@/server/auth";
import { PrivateSidebar } from "@/features/private/components/private-sidebar";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return (
    <div className="flex min-h-screen">
      <PrivateSidebar />
      <main className="flex-1 lg:pl-64">
        <div className="p-6 pt-20 lg:pt-6">{children}</div>
      </main>
    </div>
  );
}
