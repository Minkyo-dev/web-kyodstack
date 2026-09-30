"use client";

import { useCallback, useContext, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";
import { ProgressSinkContext } from "./progress-sink";

/** Run a Server Action, toast its human-readable error, and expose pending state. */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();
  const sink = useContext(ProgressSinkContext);

  const run = useCallback(
    <T,>(
      action: () => Promise<ActionResult<T>>,
      opts: { success?: string; onSuccess?: (data: T) => void; onError?: () => void } = {},
    ) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            if (result.progress) sink(result.progress);
            if (opts.success) toast.success(opts.success);
            opts.onSuccess?.(result.data);
          } else {
            toast.error(result.message);
            opts.onError?.();
          }
          resolve(result);
        });
      }),
    [sink],
  );

  return { run, pending };
}
