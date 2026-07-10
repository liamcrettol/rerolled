"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Client-driven Crucible history sync. Fires when the dashboard mounts
// (throttled across navigations) and does two things:
//   1. A fast top-up of the viewer's newest matches, so recent games appear
//      immediately.
//   2. Drives the deep-history backfill a bounded number of pages per session,
//      walking further back each visit. This replaces the server cron: history
//      imports while the viewer actually has the app open.
const THROTTLE_MS = 90_000;
const STORAGE_KEY = "crucible-sync-at";
const MAX_BACKFILL_PAGES = 25;
const PAGE_DELAY_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function CrucibleHistorySync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    let last = 0;
    try {
      last = Number(sessionStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      // sessionStorage can throw in private modes; fall through and sync anyway.
    }
    if (Date.now() - last < THROTTLE_MS) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore write failures; worst case we sync a little more often
    }

    (async () => {
      let changed = false;

      // 1) Instant top-up of the newest matches.
      try {
        const res = await fetch("/api/crucible/refresh", { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { imported?: number };
          if ((data.imported ?? 0) > 0) changed = true;
        }
      } catch {
        // best-effort
      }
      if (changed && !cancelled) router.refresh();

      // 2) Walk the deep-history backfill, bounded per session so the browser is
      //    never stuck looping; the next visit resumes where this left off.
      for (let page = 0; page < MAX_BACKFILL_PAGES && !cancelled; page++) {
        let hasMore = false;
        try {
          const res = await fetch("/api/crucible/sync-page", { method: "POST" });
          if (!res.ok) break;
          const data = (await res.json()) as { imported?: number; hasMore?: boolean };
          hasMore = Boolean(data.hasMore);
          if ((data.imported ?? 0) > 0) {
            changed = true;
            // Surface progress periodically without refreshing on every page.
            if (page % 3 === 2 && !cancelled) router.refresh();
          }
        } catch {
          break;
        }
        if (!hasMore) break;
        await sleep(PAGE_DELAY_MS);
      }

      if (changed && !cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
