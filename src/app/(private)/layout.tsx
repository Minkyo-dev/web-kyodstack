import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/auth";
import { logout } from "@/features/auth/actions/auth.actions";
import { PrivateNav } from "@/components/layout/private-nav";
import { Toaster } from "sonner";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserOrRedirect();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 md:w-52 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:py-4">
        <Link href="/" className="px-3 text-base font-semibold">
          Kyod
        </Link>
        <div className="md:mt-4 md:flex-1">
          <PrivateNav />
        </div>
        <form action={logout} className="md:border-t md:border-border md:pt-3">
          <p className="hidden truncate px-3 pb-2 text-xs text-muted-foreground md:block">
            {user.email}
          </p>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden md:inline">로그아웃</span>
            <span className="sr-only md:hidden">로그아웃</span>
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </div>
  );
}
