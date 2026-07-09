"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-level error boundary. Rerolled leans on two flaky externals (the Bungie
// API and Supabase), so an unhandled throw in a server component is a normal
// failure mode, not an exceptional one. Give the player a branded page and a
// retry instead of Next's default error screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="section-label">Something broke</p>
      <h1 className="text-2xl font-bold text-red-400">This page failed to load</h1>
      <p className="text-gray-400 max-w-md">
        Bungie&apos;s API or our database may be having a moment. Try again, and if it
        keeps happening, head back to the dashboard.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-600 font-mono">Reference: {error.digest}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="border border-bungie-border hover:border-bungie-blue text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
