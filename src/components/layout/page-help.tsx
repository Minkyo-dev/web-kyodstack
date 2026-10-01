"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTerms } from "@/hooks/use-terms";
import { pageHelp, type PageHelpKey } from "@/lib/page-help";

/**
 * (?) next to a page title: opens on hover, and on click/focus for keyboard and touch. Explains what the page is
 * and how to use it, in the active terminology.
 */
export function PageHelp({ page }: { page: PageHelpKey }) {
  const terms = useTerms();
  const help = pageHelp(page, terms);
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={`${help.title} 도움말`}
        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CircleHelp className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-sm" aria-label={`${help.title} 도움말`}>
        <p className="font-medium">{help.title}</p>
        <p className="text-muted-foreground">{help.concept}</p>
        <p className="pt-1 text-xs font-semibold tracking-widest text-muted-foreground">사용 방법</p>
        <ol className="list-decimal space-y-1 pl-4">
          {help.howTo.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
