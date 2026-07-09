"use client";

import { useState } from "react";
import { Crown, Check } from "lucide-react";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";
import EquippedBadges from "@/components/badges/EquippedBadges";
import type { DisplayBadge } from "@/lib/badges/data";

interface Props {
  member: LobbyMember;
  compact?: boolean;
  variant?: "default" | "sidebar" | "nav";
  badges?: DisplayBadge[];
}

type BadgeBackedMember = LobbyMember & { badges?: DisplayBadge[] };

export default function PlayerCard({ member, compact, variant = "default", badges }: Props) {
  const [bgFailed, setBgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const bgUrl =
    !bgFailed && member.emblem_background_path
      ? `https://www.bungie.net${member.emblem_background_path}`
      : null;

  const iconUrl =
    !iconFailed && member.emblem_path
      ? `https://www.bungie.net${member.emblem_path}`
      : null;

  // emblem_background_path is Bungie's 474x96 nameplate, which has the 96x96
  // emblem icon baked into its left edge - so when it's present we don't draw a
  // separate icon, we just indent the text past it. object-cover means the
  // banner is scaled by width on wide cards and by height on narrow ones, so
  // that baked-in icon lands at either 20.25% of the card width or exactly the
  // card height. The pl-[max(22%,...)] below clears whichever is larger.
  const bannerUrl = bgUrl ?? iconUrl;
  const showSeparateIcon = !bgUrl && !!iconUrl;
  const resolvedBadges = badges ?? (member as BadgeBackedMember).badges;
  const badgeStrip = resolvedBadges?.length ? (
    <EquippedBadges badges={resolvedBadges} max={compact ? 2 : 3} size="icon" />
  ) : null;

  function handleBannerError() {
    if (bgUrl) setBgFailed(true);
    else setIconFailed(true);
  }

  if (variant === "nav") {
    // Same layout as the sidebar variant below, scaled down to fit the nav's
    // h-10 slot instead of h-14.
    return (
      <div className="relative flex h-10 w-52 shrink-0 items-center overflow-hidden border border-bungie-border bg-bungie-dark">
        {bannerUrl ? (
          <>
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-left"
              onError={handleBannerError}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
          </>
        ) : (
          <div className="absolute inset-0 bg-bungie-dark" />
        )}

        <div className={`relative z-10 flex min-w-0 flex-1 items-center gap-2 px-2 ${bgUrl ? "pl-[max(22%,2.75rem)]" : ""}`}>
          {showSeparateIcon && (
            <div className="shrink-0 w-7 h-7 overflow-hidden border border-white/15 bg-bungie-border/30">
              <img
                src={iconUrl}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setIconFailed(true)}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="text-xs font-bold truncate leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {trimBungieName(member.display_name)}
            </span>
            {(member.clan_name || badgeStrip) && (
              <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-gray-300/90 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {member.clan_name && <span className="truncate">{member.clan_name}</span>}
                {badgeStrip}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div
        className={`relative flex h-14 w-full items-center overflow-hidden border bg-bungie-dark ${
          member.is_captain
            ? "border-yellow-500/60"
            : member.is_spectator
            ? "border-bungie-border opacity-60"
            : "border-bungie-border/70"
        }`}
      >
        {bannerUrl ? (
          <>
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-left"
              onError={handleBannerError}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
          </>
        ) : (
          <div className="absolute inset-0 bg-bungie-dark" />
        )}

        <div className={`relative z-10 flex min-w-0 flex-1 items-center gap-2 px-2 ${bgUrl ? "pl-[max(22%,4rem)]" : ""}`}>
          {showSeparateIcon && (
            <div className="shrink-0 w-8 h-8 overflow-hidden border border-white/15 bg-bungie-border/30">
              <img
                src={iconUrl}
                alt=""
                className="w-full h-full object-contain"
                onError={() => setIconFailed(true)}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 translate-y-[1px] flex-col justify-center">
            <span className="text-xs font-semibold truncate leading-tight flex items-center gap-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {member.is_captain && <Crown size={12} className="shrink-0 text-yellow-400" />}
              <span className="truncate">{trimBungieName(member.display_name)}</span>
            </span>
            {member.is_spectator ? (
              <span className="text-[10px] text-gray-300 leading-tight drop-shadow">spectating</span>
            ) : member.clan_name || badgeStrip ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-gray-300/90 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {member.clan_name && <span className="truncate">{member.clan_name}</span>}
                {badgeStrip && <span className="shrink-0">{badgeStrip}</span>}
              </span>
            ) : null}
          </div>
          {!member.is_spectator && member.selected_character_id && (
            <Check size={13} className="text-green-400 shrink-0 animate-fade-in drop-shadow" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center overflow-hidden border bg-bungie-dark w-full ${compact ? "h-14" : "h-16"}
        ${member.is_captain
          ? "border-yellow-500/60"
          : member.is_spectator
          ? "border-bungie-border opacity-60"
          : "border-bungie-border"
        }`}
    >
      {bannerUrl ? (
        <>
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-left"
            onError={handleBannerError}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      {showSeparateIcon && (
        <div className={`relative z-10 shrink-0 ml-1.5 ${compact ? "w-9 h-9" : "w-12 h-12"} overflow-hidden border border-white/15 bg-bungie-border/30`}>
          <img
            src={iconUrl}
            alt=""
            className="w-full h-full object-contain"
            onError={() => setIconFailed(true)}
          />
        </div>
      )}

      <div
        className={`relative z-10 flex-1 min-w-0 pr-2.5 flex translate-y-[1px] flex-col justify-center ${
          bgUrl ? (compact ? "pl-[max(22%,4rem)]" : "pl-[max(22%,4.5rem)]") : "px-2.5"
        }`}
      >
        <span
          className={`${compact ? "text-sm" : "text-base"} font-bold truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]
            ${member.is_spectator ? "text-gray-300" : "text-white"}`}
        >
          {trimBungieName(member.display_name)}
        </span>
        {member.is_spectator ? (
          <span className="text-[11px] text-gray-300 leading-tight drop-shadow">spectating</span>
        ) : member.clan_name || badgeStrip ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-200/90 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {member.clan_name && <span className="truncate">{member.clan_name}</span>}
            {badgeStrip && <span className="shrink-0">{badgeStrip}</span>}
          </span>
        ) : null}
      </div>

      {!member.is_spectator && member.selected_character_id && (
        <span className="absolute top-1 right-1.5 z-10 text-green-400 drop-shadow animate-fade-in" aria-label="Guardian selected">
          <Check size={14} />
        </span>
      )}
    </div>
  );
}
