"use client";

// Platform top nav (#243).
//
// Product wordmark + primary section links + signed-in Bungie display name.

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import BrandWordmark from "@/components/BrandWordmark";
import PlayerCard from "@/components/PlayerCard";
import type { LobbyMember } from "@/types/lobby";

const LINKS = [
  { href: "/dashboard", label: "PLAY" },
  { href: "/leaderboards", label: "LEADERBOARDS" },
  { href: "/stats", label: "STATS" },
];

// PlayerCard (#318) wants a full LobbyMember — the nav only has a name, an
// emblem, and a clan name, so stub the lobby-specific fields it doesn't render.
function navMember(
  displayName: string,
  emblemPath?: string | null,
  emblemBackgroundPath?: string | null,
  clanName?: string | null
): LobbyMember {
  return {
    id: "nav",
    lobby_id: "",
    user_id: "",
    display_name: displayName,
    bungie_membership_type: 0,
    bungie_membership_id: "",
    selected_character_id: null,
    emblem_path: emblemPath ?? null,
    emblem_background_path: emblemBackgroundPath ?? null,
    clan_name: clanName ?? null,
    clan_tag: null,
    is_ready: false,
    is_captain: false,
    is_spectator: false,
    joined_at: "",
  };
}

export default function TopNav({
  displayName,
  emblemPath,
  emblemBackgroundPath,
  clanName,
}: {
  displayName?: string;
  emblemPath?: string | null;
  emblemBackgroundPath?: string | null;
  clanName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-bungie-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0 sm:h-[4.5rem]">
        <Link href="/dashboard" className="flex items-baseline gap-2 shrink-0">
          <BrandWordmark className="text-xl" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">beta</span>
        </Link>

        <nav className="order-3 flex basis-full items-center gap-5 overflow-x-auto sm:order-none sm:flex-1 sm:basis-auto sm:gap-6">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                  active ? "text-bungie-blue" : "text-gray-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {displayName && (
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 sm:ml-0">
            <PlayerCard
              member={navMember(displayName, emblemPath, emblemBackgroundPath, clanName)}
              variant="nav"
              compact
            />
            <SignOutButton />
          </div>
        )}
      </div>
    </header>
  );
}
