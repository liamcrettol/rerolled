"use client";

export default function BungieReauthPrompt({
  message = "Your Bungie connection looks stale. Reconnect it to load your characters and inventory again.",
}: {
  message?: string;
}) {
  return (
    <div className="border border-amber-400/40 bg-amber-400/5 p-4 space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Reconnect Bungie</p>
        <p className="text-sm text-gray-300 mt-1">{message}</p>
      </div>
      <div className="flex items-center gap-3">
        {/* OAuth re-auth needs a full navigation to the API route. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/auth/bungie/login?reauth=true"
          className="inline-flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider bg-bungie-blue hover:bg-[#26bcf3] text-white transition-colors"
        >
          Reconnect Bungie
        </a>
        <p className="text-xs text-gray-500">Opens Bungie&apos;s account picker to refresh your session.</p>
      </div>
    </div>
  );
}
