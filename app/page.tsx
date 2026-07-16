import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import HeroReel from "@/components/HeroReel";
import ModeSpotlight from "@/components/ModeSpotlight";
import FireteamMoment from "@/components/FireteamMoment";
import FireteamReadyPanel from "@/components/FireteamReadyPanel";
import { getRandomWeaponSample } from "@/lib/bungie/definitions";
import { MODES } from "@/lib/modes/modes";
import Link from "next/link";
import BrandWordmark from "@/components/BrandWordmark";
import BrandMark from "@/components/BrandMark";

const LANDING_MODES = [MODES.gun_roulette, MODES.draft];

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await auth();
  const { code } = await searchParams;

  if (session?.userId) {
    redirect(code ? `/join/${code}` : "/dashboard");
  }

  const heroWeaponsBySlot = getRandomWeaponSample(60);

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="flex items-center gap-3 border-b border-bungie-border pb-5">
          <BrandMark className="h-9 w-9 sm:h-10 sm:w-10" />
          <h1 className="text-3xl sm:text-4xl">
            <BrandWordmark />
          </h1>
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(520px,1.15fr)] lg:gap-16 lg:py-16">
          <div className="max-w-xl">
            <p className="section-label mb-4 text-bungie-blue">Roll together</p>
            <div className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              <FireteamMoment />
            </div>
            <div className="mt-8 flex max-w-sm flex-col gap-3">
              {code && (
                <p className="border-l-2 border-bungie-blue bg-bungie-blue/5 px-3 py-2 text-sm text-bungie-blue">
                  Lobby <span className="font-mono font-bold slashed-zero">{code}</span> is waiting for you.
                </p>
              )}
              <SignInButton returnTo={code ? `/join/${code}` : undefined} />
              <p className="text-xs leading-relaxed text-gray-600">
                Uses your Bungie account to read inventories and equip the loadout you choose.
              </p>
            </div>
          </div>

          <div className="panel relative overflow-hidden p-5 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bungie-blue to-transparent opacity-80" />
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="section-label text-gray-500">Live preview</p>
                <p className="mt-1 text-sm text-gray-300">Roll. Ready up. Play.</p>
              </div>
              <span className="h-2 w-2 bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]" aria-hidden="true" />
            </div>
            <div className="flex flex-col items-center justify-center gap-7 xl:flex-row xl:gap-6">
              <HeroReel weaponsBySlot={heroWeaponsBySlot} />
              <FireteamReadyPanel />
            </div>
          </div>
        </section>

        <section className="border-t border-bungie-border py-8">
          <div className="mb-5">
            <div>
              <p className="section-label text-bungie-blue">Choose your format</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Two ways to build a loadout</h2>
            </div>
          </div>
          <ModeSpotlight modes={LANDING_MODES} />
        </section>

        <footer className="flex flex-col gap-2 border-t border-bungie-border py-5 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Made by Invict Software Solutions</span>
          <Link href="/privacy" className="inline-flex min-h-[44px] items-center hover:text-gray-400">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </main>
  );
}
