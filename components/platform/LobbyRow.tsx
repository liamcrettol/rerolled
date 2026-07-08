import LobbyControls from "@/components/LobbyControls";
import type { Lobby, LobbyMode } from "@/types/lobby";

// Compact lobby utility for resuming an active lobby or joining a friend's code.
export default function LobbyRow({
  activeSession,
}: {
  activeSession?: { code: string; status: Lobby["status"]; mode: LobbyMode } | null;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="section-label mb-1">Fireteam Lobby</p>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Rejoin or enter a code</h2>
        </div>
      </div>
      <LobbyControls activeSession={activeSession} showCreate={false} />
    </section>
  );
}
