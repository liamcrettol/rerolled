"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityPoll } from "@/hooks/useVisibilityPoll";

// This component is mounted in the root layout, so this check runs on every
// page for every visitor for as long as the tab is open. At 60s a single
// forgotten tab was ~1,400 requests a day finding nothing. 10 minutes is
// plenty for a "new version available" nudge, and useVisibilityPoll keeps
// hidden tabs from checking at all.
const CHECK_INTERVAL_MS = 10 * 60_000;

export default function UpdateAvailable() {
  const currentVersion = useRef<string | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch("/api/version", { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as { version?: string };
      if (!active.current || !data.version) return;

      if (currentVersion.current === null) {
        currentVersion.current = data.version;
        return;
      }

      if (data.version !== currentVersion.current) {
        setUpdateVersion(data.version);
      }
    } catch {
      // A failed version check should never interrupt the app.
    }
  }, []);

  // Seed the baseline version once on mount; useVisibilityPoll handles the
  // recurring checks (and skips them entirely while the tab is hidden).
  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  useVisibilityPoll(checkForUpdate, CHECK_INTERVAL_MS);

  if (!updateVersion) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl items-center justify-between gap-4 border border-bungie-border bg-bungie-surface px-4 py-3 shadow-2xl sm:inset-x-auto sm:right-6 sm:left-auto">
      <p className="text-sm font-semibold text-gray-100">New version available</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border border-bungie-gold bg-bungie-gold px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-bungie-dark transition hover:brightness-110"
        >
          Click here to update
        </button>
        <button
          type="button"
          onClick={() => setUpdateVersion(null)}
          className="px-2 py-1.5 text-xs font-semibold text-gray-400 transition hover:text-gray-100"
        >
          Later
        </button>
      </div>
    </div>
  );
}
