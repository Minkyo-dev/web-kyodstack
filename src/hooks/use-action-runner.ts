"use client";

import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";

/** Run a Server Action, toast its human-readable error, and expose pending state. */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    <T,>(
      action: () => Promise<ActionResult<T>>,
      opts: { success?: string; onSuccess?: (data: T) => void; onError?: () => void } = {},
    ) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            if (opts.success) toast.success(opts.success);
            opts.onSuccess?.(result.data);
          } else {
            toast.error(result.message);
            opts.onError?.();
          }
          resolve(result);
        });
      }),
    [],
  );

  return { run, pending };
}
