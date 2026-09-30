"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  AppWindow,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { label: "Dashboard", href: "/private/dashboard", icon: LayoutDashboard },
  { label: "Resume", href: "/private/resume", icon: FileText },
  { label: "Apps", href: "/private/apps", icon: AppWindow },
];

function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-4">
        <span className="text-base font-semibold text-foreground">Kyod</span>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <div className="flex items-center gap-2">
          <Avatar>
            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
              KY
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm text-muted-foreground">
            kyod@example.com
          </span>
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full justify-start gap-2 text-muted-foreground"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}

export function PrivateSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-sidebar lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b border-border bg-sidebar px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="메뉴 열기"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="ml-2 text-base font-semibold text-foreground">
          Kyod
        </span>
      </div>

      {/* Mobile sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation menu
          </SheetDescription>
          <SidebarContent pathname={pathname} />
        </SheetContent>
      </Sheet>
    </>
  );
}
