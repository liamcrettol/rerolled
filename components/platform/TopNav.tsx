"use client";

// Platform top nav (#243).
//
// Product wordmark + primary section links + signed-in Bungie display name.

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import BrandWordmark from "@/components/BrandWordmark";

const LINKS = [
  { href: "/dashboard", label: "PLAY" },
  { href: "/weekly", label: "WEEKLY" },
  { href: "/leaderboards", label: "LEADERBOARDS" },
  { href: "/stats", label: "STATS" },
];

export default function TopNav({ displayName }: { displayName?: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-bungie-border">
      <div className="max-w-7xl mx-auto flex items-center gap-6 px-6 h-14">
        <Link href="/dashboard" className="flex items-baseline gap-2 shrink-0">
          <BrandWordmark className="text-lg" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">beta</span>
        </Link>

        <nav className="flex items-center gap-5 flex-1 min-w-0 overflow-x-auto">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                  active ? "text-bungie-blue" : "text-gray-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {displayName && (
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <span className="text-xs text-gray-400 truncate max-w-[10rem]">{displayName}</span>
            <SignOutButton />
          </div>
        )}
      </div>
    </header>
  );
}
