import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Kyodstack mark (ADR 0045). Original colors on light surfaces; on dark surfaces the ink parts turn light so the
 * shape stays readable. Decorative: pair it with the visible name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-block size-6 shrink-0", className)}>
      <Image src="/brand/logo-mark.png" alt="" fill sizes="64px" className="object-contain dark:hidden" />
      <Image src="/brand/logo-mark-on-dark.png" alt="" fill sizes="64px" className="hidden object-contain dark:block" />
    </span>
  );
}
