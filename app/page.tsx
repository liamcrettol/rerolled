import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignInButton from "@/components/SignInButton";
import MidaHeader from "@/components/MidaHeader";
export default async function Home({ searchParams }: { searchParams: Promise<{code?: string}> }) {
  const session = await auth();
  const {code} = await searchParams;
  if (session?.userId) redirect(code ? `/join/${code}` : "/dashboard");
  return <><MidaHeader tool="rerolled" /><main className="mida-wrap">
    <section className="mida-hero"><h1>Rerolled</h1><p>Random loadouts from what your fireteam actually owns.</p></section>
    <div className="pb-20">{code && <p className="mb-4 text-bungie-blue">Lobby <span className="tabular-nums">{code}</span> is waiting for you.</p>}
      <SignInButton returnTo={code ? `/join/${code}` : undefined} />
      <p className="mt-4 max-w-md text-sm text-gray-400">Uses your Bungie account to read inventories and equip the loadout you choose.</p>
    </div>
    <section aria-label="Ways to play" className="max-w-2xl space-y-8 pb-12"><div><h2 className="text-lg font-semibold">Loadout roulette</h2><p className="mt-2 text-gray-400">Roll a shared loadout for your fireteam.</p></div><div><h2 className="text-lg font-semibold">Draft</h2><p className="mt-2 text-gray-400">Choose one of three weapons for each slot.</p></div></section>
    <footer className="mida-footer"><a href="https://mida.tools">All applications</a><Link href="/privacy">Privacy policy</Link><span>Fan-made. Destiny and MIDA belong to Bungie.</span></footer>
  </main></>;
}
