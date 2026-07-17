"use client";

// Platform top nav (#243).
//
// Product wordmark + primary section links + signed-in Bungie display name.

import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import BrandMark from "@/components/BrandMark";
import BrandWordmark from "@/components/BrandWordmark";
import PlayerCard from "@/components/PlayerCard";
import type { LobbyMember } from "@/types/lobby";

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
  return (
    <header className="border-b border-bungie-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-0 sm:h-[4.5rem]">
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
          <BrandMark className="h-7 w-7" />
          <span className="flex items-baseline gap-2">
            <BrandWordmark className="text-xl" />
            <span className="text-lg font-bold uppercase tracking-widest text-gray-600">beta</span>
          </span>
        </Link>

        <a
          href="https://rival.rerolled.io"
          className="shrink-0 text-xs font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-white"
        >
          View Rival
        </a>

        <div className="hidden h-px flex-1 bg-gradient-to-r from-bungie-border to-transparent sm:block" aria-hidden="true" />

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
