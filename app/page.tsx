import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import HeroReel from "@/components/HeroReel";
import { getRandomWeaponSample } from "@/lib/bungie/definitions";
import Link from "next/link";

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
        <h1 className="text-5xl md:text-6xl font-bold uppercase tracking-tight text-white">
          Gun Roulette
        </h1>
        <p className="text-gray-400 mt-3">Random loadouts for your fireteam.</p>
      </div>

      <HeroReel weaponsBySlot={heroWeaponsBySlot} />

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
