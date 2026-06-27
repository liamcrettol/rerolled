"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <div className="flex items-center gap-3">
      {/* OAuth re-auth entry point — must be a full navigation to the API route, not a client-side <Link>. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/auth/bungie/login?reauth=true"
        className="text-xs text-gray-500 hover:text-bungie-blue transition"
        title="Sign in with a different Bungie account"
      >
        Switch account
      </a>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-sm text-gray-400 hover:text-white transition"
      >
        Sign out
      </button>
    </div>
  );
}
