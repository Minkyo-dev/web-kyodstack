"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navLinks = [
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="메뉴 열기" />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
          <SheetDescription className="sr-only">
            사이트 내비게이션 메뉴
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col">
          {navLinks.map((link) => (
            <SheetClose key={link.href} render={<Link href={link.href} />}>
              <span className="block border-b border-border px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </span>
            </SheetClose>
          ))}
          <div className="mt-4">
            <SheetClose render={<Link href="/login" />}>
              <span className="block border-b border-border px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
                Login
              </span>
            </SheetClose>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
