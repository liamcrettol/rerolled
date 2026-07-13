import Link from "next/link";
import { Dices } from "lucide-react";

// Shared "nothing here yet" treatment (audit follow-up) - Leaderboards, Stats,
// and the Weekly standings preview each used to hand-roll their own plain
// centered text, which read as flat/unfinished on a beta with few runs
// recorded. One icon + message + optional CTA unifies the visual weight.

interface Props {
  message: string;
  cta?: { label: string; href: string };
  className?: string;
}

export default function EmptyState({ message, cta, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 px-4 text-center ${className}`}>
      <Dices size={26} className="text-gray-600" aria-hidden="true" />
      <p className="text-sm text-gray-400 max-w-xs">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="text-[11px] font-bold uppercase tracking-widest text-bungie-blue hover:text-[#26bcf3] transition-colors"
        >
          {cta.label} &gt;
        </Link>
      )}
    </div>
  );
}
