import { toLocalDate } from "@/features/scheduler/utils/timezone";

/** A path's start/retire instants as local days in the user's zone (never a UTC slice). */
export function pathDates(
  p: { started_at: string; retired_at: string | null },
  zone: string,
): { started: string; retired: string | null } {
  return { started: toLocalDate(p.started_at, zone), retired: p.retired_at ? toLocalDate(p.retired_at, zone) : null };
}
