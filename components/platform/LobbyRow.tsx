import LobbyControls from "@/components/LobbyControls";
import type { Lobby } from "@/types/lobby";

// Create / join lobby row (#243). Thin section wrapper around the existing,
// working LobbyControls so the roulette lobby flow stays usable inside the new
// home shell without being reimplemented.
export default function LobbyRow({
  activeSession,
}: {
  activeSession?: { code: string; status: Lobby["status"] } | null;
}) {
  return (
    <section>
      <p className="section-label mb-3">Lobby</p>
      <LobbyControls activeSession={activeSession} />
    </section>
  );
}
