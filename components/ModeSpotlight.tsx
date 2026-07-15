import { ArrowRight } from "lucide-react";
import type { ModeDefinition } from "@/types/platform";
import { MODE_ICONS, ACCENT_CLS } from "@/components/platform/modeVisuals";

// Signed-out overview of the two surviving formats. Both stay visible and
// carry equal weight; the sign-in action above remains the single entry point.
export default function ModeSpotlight({ modes }: { modes: ModeDefinition[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {modes.map((mode) => {
        const accent = ACCENT_CLS[mode.accent];
        const Icon = MODE_ICONS[mode.id];

        return (
          <div key={mode.id} className={`panel border-l-2 ${accent.border} flex min-h-40 flex-col p-5 sm:p-6`}>
            <div className="flex min-w-0 items-center gap-2">
              <Icon size={18} className={`shrink-0 ${accent.icon}`} aria-hidden="true" />
              <p className={`text-[10px] font-bold uppercase tracking-widest ${accent.icon}`}>{mode.eyebrow}</p>
            </div>
            <h3 className="mt-3 text-xl font-bold uppercase tracking-wide text-white">{mode.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">{mode.description}</p>
            <p className={`mt-auto pt-5 text-[10px] font-bold uppercase tracking-widest ${accent.action}`}>
              Sign in to play <ArrowRight size={12} className="ml-1 inline" aria-hidden="true" />
            </p>
          </div>
        );
      })}
    </div>
  );
}
