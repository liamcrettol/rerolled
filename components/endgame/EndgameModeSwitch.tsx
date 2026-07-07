"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Mode = "solo" | "fireteam";

// Toggles the signed-in Endgame Roulette page between the original solo
// randomizer and the new fireteam lobby entry point, without touching either
// flow's own code - solo stays exactly as it was before this existed.
export default function EndgameModeSwitch({
  solo,
  fireteam,
}: {
  solo: ReactNode;
  fireteam: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("solo");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("solo")}
          className={`text-xs font-bold uppercase tracking-wider px-4 py-2 border transition-colors ${
            mode === "solo" ? "border-red-400 text-white bg-red-400/10" : "border-bungie-border text-gray-400 hover:border-gray-400"
          }`}
        >
          Solo
        </button>
        <button
          type="button"
          onClick={() => setMode("fireteam")}
          className={`text-xs font-bold uppercase tracking-wider px-4 py-2 border transition-colors ${
            mode === "fireteam" ? "border-red-400 text-white bg-red-400/10" : "border-bungie-border text-gray-400 hover:border-gray-400"
          }`}
        >
          Fireteam
        </button>
      </div>

      {mode === "solo" ? solo : fireteam}
    </div>
  );
}
