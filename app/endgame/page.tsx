import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Skull } from "lucide-react";
import PlatformShell from "@/components/platform/PlatformShell";
import EndgameRandomizer from "@/components/endgame/EndgameRandomizer";
import { getMode } from "@/lib/modes/modes";

export const dynamic = "force-dynamic";

export default async function EndgamePage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const mode = getMode("ironman");

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="max-w-5xl space-y-8">
        <section className="panel border-l-2 border-l-red-400 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Skull size={14} className="text-red-400" aria-hidden="true" />
            <p className="section-label text-red-400">{mode.eyebrow}</p>
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border text-red-400 border-red-400/40">
              New
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-white">
            {mode.title}
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-3xl leading-relaxed">
            Pick a character, choose whether to roll a raid, dungeon, Grandmaster, or any mix of
            them, and get a full endgame assignment: one activity, one exotic armor piece, and one
            three-weapon loadout.
          </p>

          <div className="mt-6">
            <EndgameRandomizer />
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
