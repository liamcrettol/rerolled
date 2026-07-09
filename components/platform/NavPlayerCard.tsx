"use client";

// Compact player card for the top nav (#318) — replaces the plain display
// name text with the same emblem-banner treatment PlayerCard uses in lobby
// contexts, sized down to fit the h-14 header.

import { useState } from "react";
import { trimBungieName } from "@/lib/utils";

interface Props {
  displayName: string;
  clanTag?: string | null;
  emblemPath?: string | null;
  emblemBackgroundPath?: string | null;
}

export default function NavPlayerCard({ displayName, clanTag, emblemPath, emblemBackgroundPath }: Props) {
  const [bgFailed, setBgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const bgUrl = !bgFailed && emblemBackgroundPath ? `https://www.bungie.net${emblemBackgroundPath}` : null;
  const iconUrl = !iconFailed && emblemPath ? `https://www.bungie.net${emblemPath}` : null;
  const bannerUrl = bgUrl ?? iconUrl;
  const showSeparateIcon = !bgUrl && !!iconUrl;

  function handleBannerError() {
    if (bgUrl) setBgFailed(true);
    else setIconFailed(true);
  }

  return (
    <div className="relative flex h-10 w-40 shrink-0 items-center overflow-hidden border border-bungie-border bg-bungie-dark">
      {bannerUrl ? (
        <>
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-left"
            onError={handleBannerError}
          />
          <div className="absolute inset-0 bg-black/50" />
        </>
      ) : null}

      {showSeparateIcon && (
        <div className="relative z-10 ml-1 h-7 w-7 shrink-0 overflow-hidden border border-white/15 bg-bungie-border/30">
          <img src={iconUrl} alt="" className="h-full w-full object-contain" onError={() => setIconFailed(true)} />
        </div>
      )}

      <div className={`relative z-10 flex min-w-0 flex-1 flex-col justify-center px-2 ${bgUrl ? "" : "pl-2"}`}>
        <span className="truncate text-[11px] font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {trimBungieName(displayName)}
        </span>
        {clanTag && (
          <span className="truncate text-[9px] leading-tight text-gray-300/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {clanTag}
          </span>
        )}
      </div>
    </div>
  );
}
