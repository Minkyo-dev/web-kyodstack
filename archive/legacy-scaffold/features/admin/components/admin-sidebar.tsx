"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderOpen,
  Pencil,
  Shield,
  User,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Projects", href: "/admin/projects", icon: FolderOpen },
  { label: "Blog", href: "/admin/blog", icon: Pencil },
  { label: "Access", href: "/admin/access", icon: Shield },
  { label: "Profile", href: "/admin/profile", icon: User },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

function NavList() {
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.label === "Dashboard";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 border-r border-border bg-sidebar lg:block">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <NavList />
      </aside>

      {/* Mobile header + Sheet */}
      <div className="fixed left-0 top-0 z-40 flex h-14 w-full items-center border-b border-border bg-sidebar px-4 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu" />
            }
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </SheetTrigger>
          <SheetContent side="left" showCloseButton={false}>
            <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Admin sidebar navigation menu
            </SheetDescription>
            <div className="flex h-14 items-center border-b border-border px-4">
              <span className="text-sm font-semibold">Admin</span>
            </div>
            <NavList />
          </SheetContent>
        </Sheet>
        <span className="ml-3 text-sm font-semibold">Admin</span>
      </div>
    </>
  );
}
