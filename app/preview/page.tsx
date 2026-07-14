import { notFound } from "next/navigation";
import SeedButton from "./SeedButton";
import LobbyMockup from "./LobbyMockup";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  // Internal "fake test environment" harness (seed button + UI mockups). Never
  // expose it on the production domain - same production lockout as
  // /api/cron and /api/dev/seed. It stays reachable on preview and local.
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-bungie-dark">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Preview</h1>
            <p className="text-xs text-gray-500 mt-1">
              Fake test environment · no auth required · hit Seed to populate the DB with sample data
            </p>
          </div>
          <SeedButton />
        </div>

        {/* Interactive lobby UI mockup */}
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Lobby UI Mockup</p>
          <LobbyMockup />
        </div>
      </div>
    </div>
  );
}
