import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import HeroReel from "@/components/HeroReel";
import { getRandomWeaponSample } from "@/lib/bungie/definitions";
import { MODES } from "@/lib/modes/modes";
import type { ModeAccent } from "@/types/platform";
import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";

// Signed-out landing. Pitches the whole activity hub (mode strip below the
// sign-in), not just roulette — each mode wears its accent from the registry.
const MODE_ACCENT_TEXT: Record<ModeAccent, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  blue: "text-bungie-blue",
  purple: "text-purple-400",
  red: "text-red-400",
};

const LANDING_MODES = [
  MODES.gun_roulette,
  MODES.score_attack,
  MODES.weekly_challenge,
  MODES.draft,
  MODES.ironman,
];

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await auth();
  const { code } = await searchParams;

  if (session?.userId) {
    redirect(code ? `/join/${code}` : "/dashboard");
  }

  const heroWeaponsBySlot = getRandomWeaponSample(60);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
      <div className="text-center">
        <p className="section-label text-bungie-blue mb-3">Destiny 2</p>
        <h1 className="text-5xl md:text-6xl">
          <BrandWordmark />
        </h1>
        <p className="text-gray-400 mt-3">
          PvP loadout chaos, scored PvE runs, and weekly challenges for your fireteam.
        </p>
      </div>

      <HeroReel weaponsBySlot={heroWeaponsBySlot} />

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 max-w-2xl">
        {LANDING_MODES.map((mode) => (
          <span key={mode.id} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest">
            <span className={mode.enabled ? MODE_ACCENT_TEXT[mode.accent] : "text-gray-600"}>
              {mode.title}
            </span>
            {!mode.enabled && <span className="text-[9px] text-gray-700">soon</span>}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        {code && (
          <p className="text-sm text-bungie-blue text-center">
            Invited to lobby <span className="font-mono font-bold slashed-zero">{code}</span> — sign in to join.
          </p>
        )}
        <SignInButton returnTo={code ? `/join/${code}` : undefined} />
        <p className="text-xs text-gray-500 text-center">
          Reads your inventory to build rolls. Nothing gets deleted or spent.
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>Made by Invict Software Solutions</span>
        <span aria-hidden="true">·</span>
        <Link href="/privacy" className="hover:text-gray-400">
          Privacy Policy
        </Link>
      </div>
    </main>
  );
}
