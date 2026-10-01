"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Transaction } from "../domain/finance.types";
import { TransactionDetail } from "./transaction-detail";
import { TransactionForm } from "./transaction-form";

/** Right drawer on desktop, bottom sheet on mobile (spec §17, §35) — a real bottom sheet, not a squeezed drawer. */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        className={cn(
          "gap-0",
          mobile ? "max-h-[88dvh] rounded-t-xl" : "w-full sm:max-w-md",
        )}
      >
        {mobile && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />}
        <SheetHeader className="border-b border-border pr-12">
          {header}
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** One transaction's detail (transactions page, recent list). */
export function TransactionSheet({
  tx,
  onClose,
  onChanged,
}: {
  tx: Transaction | null;
  onClose: () => void;
  /** After an edit or delete (the caller refreshes its list). */
  onChanged?: () => void;
}) {
  // Follow the prop only when it changes (an edit replaces `shown`), and keep the last transaction while closing.
  const [opened, setOpened] = useState<Transaction | null>(tx);
  const [shown, setShown] = useState<Transaction | null>(tx);
  if (tx !== opened) {
    setOpened(tx);
    if (tx) setShown(tx);
  }
  return (
    <ResponsiveSheet open={!!tx} onOpenChange={(o) => !o && onClose()} title="거래 상세">
      {shown && (
        <div className="p-4">
          <TransactionDetail
            key={shown.id}
            tx={shown}
            onChanged={(next) => {
              setShown(next);
              onChanged?.();
            }}
            onDeleted={() => {
              onChanged?.();
              onClose();
            }}
          />
        </div>
      )}
    </ResponsiveSheet>
  );
}

/** "+ 거래" from anywhere (spec §21). */
export function AddTransactionButton({
  defaultDate,
  className,
  label = "거래 추가",
  variant = "default",
}: {
  defaultDate?: string;
  className?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogTitle>거래 추가</DialogTitle>
          {open && <TransactionForm idPrefix="add" defaultDate={defaultDate} onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
