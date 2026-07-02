import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import GlowBackdrop from "@/components/GlowBackdrop";
import HeroReel from "@/components/HeroReel";
import LobbyPreview from "@/components/LobbyPreview";
import { getRandomWeaponSample } from "@/lib/bungie/definitions";
import { Shuffle, Zap, GitCompare, Users, LogIn } from "lucide-react";
import Link from "next/link";

const HOW_IT_WORKS = [
  { Icon: Users, text: "Create or join a lobby" },
  { Icon: LogIn, text: "Everyone signs in with Bungie" },
  { Icon: Shuffle, text: "Roll weapons from the shared pool" },
  { Icon: GitCompare, text: "Compare rolls and apply the loadout" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await auth();
  const { code } = await searchParams;

  if (session?.userId) {
    redirect(code ? `/join/${code}` : "/dashboard");
  }

  const heroWeaponsBySlot = getRandomWeaponSample(60);
  const previewWeapons = {
    kinetic: heroWeaponsBySlot.kinetic[0],
    energy: heroWeaponsBySlot.energy[0],
    power: heroWeaponsBySlot.power[0],
  };

  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center gap-12 p-8">
      <GlowBackdrop />

      <div className="text-center animate-rise-in" style={{ opacity: 0 }}>
        <p className="text-bungie-blue text-sm font-semibold uppercase tracking-[0.2em] mb-2">
          Destiny 2
        </p>
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-white mb-4">
          Gun Roulette
        </h1>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          Roll random loadouts for your whole fireteam and equip them in one click.
        </p>
      </div>

      <div className="animate-rise-in" style={{ opacity: 0, animationDelay: "120ms" }}>
        <HeroReel weaponsBySlot={heroWeaponsBySlot} />
      </div>

      <div
        className="flex flex-col items-center gap-4 w-full max-w-sm animate-rise-in"
        style={{ opacity: 0, animationDelay: "200ms" }}
      >
        {code && (
          <p className="text-sm text-bungie-blue text-center font-medium">
            You&apos;ve been invited to join lobby <span className="font-mono font-bold slashed-zero">{code}</span>. Sign in to join.
          </p>
        )}
        <SignInButton returnTo={code ? `/join/${code}` : undefined} />
        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>
            Signs in through Bungie.net&apos;s official OAuth. We read your inventory to
            build valid rolls and equip the loadout you choose. Nothing gets deleted,
            dismantled, or spent. Everyone in the group needs to sign in.
          </p>
          <Link href="/privacy" className="inline-block underline hover:text-gray-400">
            Privacy Policy
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 max-w-2xl w-full text-center">
        {[
          { Icon: Shuffle, title: "Random Rolls", desc: "Only rolls weapons everyone has" },
          { Icon: Zap, title: "Auto-Equip", desc: "Equips the whole fireteam at once" },
          { Icon: GitCompare, title: "Roll Comparison", desc: "See everyone's roll of the same gun" },
        ].map((f, i) => (
          <div
            key={f.title}
            className="glass-card rounded-xl p-4 transition hover:-translate-y-1 hover:border-bungie-blue/50 animate-rise-in"
            style={{ opacity: 0, animationDelay: `${280 + i * 80}ms` }}
          >
            <f.Icon size={26} className="mx-auto mb-2 text-bungie-blue" />
            <div className="font-semibold text-white text-sm">{f.title}</div>
            <div className="text-xs text-gray-400 mt-1">{f.desc}</div>
          </div>
        ))}
      </div>

      <div
        className="w-full max-w-4xl animate-rise-in"
        style={{ opacity: 0, animationDelay: "440ms" }}
      >
        <h2 className="text-center text-white text-lg font-semibold mb-1">How it works</h2>
        <p className="text-center text-gray-500 text-xs mb-6">The full loop, before you sign in.</p>
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <ol className="space-y-3">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.text} className="flex items-center gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-bungie-blue/15 border border-bungie-blue/40 text-bungie-blue text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <step.Icon size={16} className="text-bungie-blue shrink-0" />
                <span className="text-sm text-gray-300">{step.text}</span>
              </li>
            ))}
          </ol>
          <div className="flex justify-center">
            <LobbyPreview weapons={previewWeapons} />
          </div>
        </div>
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
