import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import GlowBackdrop from "@/components/GlowBackdrop";
import HeroReel from "@/components/HeroReel";
import { getRandomWeaponSample } from "@/lib/bungie/definitions";
import { Shuffle, Zap, GitCompare } from "lucide-react";
import Link from "next/link";

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await auth();
  const { code } = await searchParams;

  if (session?.userId) {
    redirect(code ? `/join/${code}` : "/dashboard");
  }

  const heroWeaponsBySlot = getRandomWeaponSample(60);

  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center gap-12 p-8">
      <GlowBackdrop />

      <div className="text-center animate-rise-in" style={{ opacity: 0 }}>
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
        <p className="text-xs text-gray-500 text-center">
          Signing in lets us read your inventory and equip weapons. Everyone in the group needs to sign in.
        </p>
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

      <Link href="/privacy" className="text-xs text-gray-600 hover:text-gray-400">
        Privacy Policy
      </Link>
    </main>
  );
}
