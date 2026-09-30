"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Rare full-screen "SYSTEM" event; closes on click, Esc or after 4 s. */
export function LevelUpEvent({ from, to, animate, onClose }: { from: number; to: number; animate: boolean; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose, to]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onClick={onClose}
        className={cn(
          "flex h-dvh w-screen max-w-none flex-col items-center justify-center gap-3 rounded-none bg-background/95 font-mono ring-0 motion-reduce:animate-none sm:max-w-none",
          !animate && "data-open:animate-none data-closed:animate-none",
        )}
      >
        <p className="text-xs tracking-[0.3em] text-muted-foreground">SYSTEM</p>
        <DialogTitle className="text-sm tracking-[0.3em]">LEVEL UP</DialogTitle>
        <p className="rounded-md border border-border px-6 py-3 text-4xl tabular-nums">
          {from} → {to}
        </p>
        <DialogDescription>누적 활동으로 레벨이 올랐습니다.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
