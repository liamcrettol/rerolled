import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await auth();
  const { code } = await searchParams;

  if (session?.userId) {
    redirect(code ? `/join/${code}` : "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white mb-2">
          Gun Roulette
        </h1>
        <p className="text-gray-400 text-lg max-w-md">
          Roll random loadouts for your whole fireteam and equip them in one click.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        {code && (
          <p className="text-sm text-bungie-blue text-center font-medium">
            You&apos;ve been invited to join lobby <span className="font-mono font-bold slashed-zero">{code}</span> - sign in to join.
          </p>
        )}
        <SignInButton />
        <p className="text-xs text-gray-500 text-center">
          Signing in lets us read your inventory and equip weapons. Everyone in the group needs to sign in.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-8 max-w-2xl text-center">
        {[
          { icon: "🎲", title: "Random Rolls", desc: "Only rolls weapons everyone has" },
          { icon: "⚡", title: "Auto-Equip", desc: "Equips the whole fireteam at once" },
          { icon: "👑", title: "Turn Rotation", desc: "Roll control rotates every game" },
        ].map((f) => (
          <div key={f.title} className="bg-bungie-surface rounded-lg p-4 border border-bungie-border">
            <div className="text-3xl mb-2">{f.icon}</div>
            <div className="font-semibold text-white">{f.title}</div>
            <div className="text-xs text-gray-400 mt-1">{f.desc}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
