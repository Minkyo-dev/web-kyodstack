"use client";

import { useEffect, useState } from "react";
import { getDayTransactionsAction } from "../actions/finance.actions";
import type { Transaction } from "../domain/finance.types";

/**
 * One day's transactions, fetched when the day is shown (spec §28): the Day Drawer and the calendar's day panel.
 * `rows` is null while loading; `reload` refetches after an add, edit or delete.
 */
export function useDayTransactions(date: string | null, initial: { date: string; rows: Transaction[] } | null = null) {
  const [loaded, setLoaded] = useState<{ date: string; rows: Transaction[] } | null>(initial);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const apply = (day: string, result: Awaited<ReturnType<typeof getDayTransactionsAction>>) => {
    if (result.ok) {
      setLoaded({ date: day, rows: result.data });
      setFailedFor(null);
    } else {
      setFailedFor(day);
    }
  };

  useEffect(() => {
    if (!date || loaded?.date === date) return;
    let cancelled = false;
    getDayTransactionsAction({ date }).then((result) => {
      if (!cancelled) apply(date, result);
    });
    return () => {
      cancelled = true;
    };
  }, [date, loaded?.date]);

  const reload = () => {
    if (!date) return;
    const day = date;
    setFailedFor(null);
    getDayTransactionsAction({ date: day }).then((result) => apply(day, result));
  };

  return {
    rows: loaded && loaded.date === date ? loaded.rows : null,
    failed: failedFor !== null && failedFor === date,
    reload,
  };
}
