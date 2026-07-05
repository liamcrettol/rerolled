import type { WeeklyRule } from "@/types/platform";

// Weekly ruleset chips (#245). Flat 1px pills; tone tints requirements vs. bans
// without leaving the DIM palette.
const TONE_CLS: Record<NonNullable<WeeklyRule["tone"]>, string> = {
  require: "text-bungie-blue border-bungie-blue/40",
  ban: "text-red-400 border-red-400/40",
  neutral: "text-gray-300 border-bungie-border",
};

export default function RuleChips({ rules }: { rules: WeeklyRule[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {rules.map((r) => (
        <span
          key={r.label}
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border ${
            TONE_CLS[r.tone ?? "neutral"]
          }`}
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}
