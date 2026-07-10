"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// On-view Crucible sync. Fires once when the dashboard mounts (throttled across
// navigations via sessionStorage) to import the viewer's newest matches, then
// refreshes the server component if anything landed. The background cron
// (sync-crucible) owns the deep-history backfill cursor; this only tops up the
// newest page, so the two never race.
const THROTTLE_MS = 90_000;
const STORAGE_KEY = "crucible-sync-at";

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
      try {
        const res = await fetch("/api/crucible/refresh", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as { imported?: number };
        if (!cancelled && (data.imported ?? 0) > 0) router.refresh();
      } catch {
        // best-effort; the background cron still backfills history
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
