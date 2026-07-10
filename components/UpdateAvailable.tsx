"use client";

import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 60_000;

export default function UpdateAvailable() {
  const currentVersion = useRef<string | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkForUpdate() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { version?: string };
        if (!active || !data.version) return;

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
    }

    checkForUpdate();
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

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
          Update now
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
