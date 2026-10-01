import { cn } from "@/lib/utils";

// Native <select> styling shared by forms that post FormData. Kept as a class string (not a
// component) so Server Components and uncontrolled forms can use it unchanged.
const base =
  "native-select min-w-0 rounded-md border border-input bg-transparent text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30";

export const nativeSelectClass = cn(base, "h-8 pr-8 pl-2.5 text-sm");
export const nativeSelectSmClass = cn(base, "h-7 pr-7 pl-2 text-xs");
