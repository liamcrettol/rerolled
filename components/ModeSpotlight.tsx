"use client";

import { useEffect, useRef, useState } from "react";
import type { ModeDefinition } from "@/types/platform";
import { MODE_ICONS, ACCENT_CLS, ACCENT_GLOW } from "@/components/platform/modeVisuals";

// Signed-out landing "mode spotlight" (#... rotation follow-up). All modes
// stay visible in a row; every CYCLE_MS one lights up (accent glow + its
// description fades in) while the rest sit dim, then the spotlight advances
// to the next mode. Hovering a card spotlights it directly and pauses the
// cycle; leaving resumes from there. Card size never changes (description
// space is reserved, not inserted) so neighbors never reflow mid-cycle.
const CYCLE_MS = 3400;

export default function ModeSpotlight({ modes }: { modes: ModeDefinition[] }) {
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setActive((i) => (i + 1) % modes.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [modes.length]);

  return (
    <div className="flex flex-wrap items-stretch justify-center gap-3 max-w-3xl">
      {modes.map((mode, i) => {
        const isActive = i === active;
        const accent = ACCENT_CLS[mode.accent];
        const Icon = MODE_ICONS[mode.id];

        return (
          <div
            key={mode.id}
            onMouseEnter={() => {
              pausedRef.current = true;
              setActive(i);
            }}
            onMouseLeave={() => {
              pausedRef.current = false;
            }}
            className={`panel border-l-2 ${accent.border} w-36 p-3 transition-opacity duration-500 ${
              isActive ? "opacity-100" : "opacity-45"
            }`}
            style={{
              boxShadow: isActive ? `0 0 0 1px ${ACCENT_GLOW[mode.accent]}` : "none",
              transition: "box-shadow 400ms ease, opacity 500ms ease",
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon size={14} className={`shrink-0 ${accent.icon}`} aria-hidden="true" />
              <p className={`text-[9px] font-bold uppercase tracking-widest truncate ${accent.icon}`}>
                {mode.eyebrow}
              </p>
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white mt-1.5">{mode.title}</h3>
            {/* Reserved height so the fade-in never shifts card size or neighbors. */}
            <p
              className={`text-[10px] text-gray-400 leading-snug mt-1.5 min-h-[2.5em] transition-opacity duration-500 ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
            >
              {mode.description}
            </p>
            {!mode.enabled && (
              <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">Soon</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
