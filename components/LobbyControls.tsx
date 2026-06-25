"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lobby } from "@/types/lobby";

const STATUS_LABELS: Record<Lobby["status"], string> = {
  waiting: "Waiting for players",
  rolling: "Rolling weapons",
  applying: "Applying loadout",
  in_game: "In game",
  done: "Ended",
};

interface Props {
  activeSession?: { code: string; status: Lobby["status"] } | null;
}

export default function LobbyControls({ activeSession }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading("create");
    setError(null);
    try {
      const res = await fetch("/api/lobby/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/lobby/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lobby");
      setLoading(null);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading("join");
    setError(null);
    try {
      const res = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/lobby/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join lobby");
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {activeSession && (
        <div className="bg-bungie-surface border border-bungie-blue/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold text-sm">Active session detected</p>
            <p className="text-gray-400 text-xs mt-0.5">
              <span className="font-mono text-bungie-blue">{activeSession.code}</span>
              {" · "}
              {STATUS_LABELS[activeSession.status]}
            </p>
          </div>
          <button
            onClick={() => router.push(`/lobby/${activeSession.code}`)}
            className="shrink-0 bg-bungie-blue hover:opacity-90 text-white font-semibold text-sm px-4 py-2 rounded-lg transition"
          >
            Rejoin
          </button>
        </div>
      )}
    <div className="grid md:grid-cols-2 gap-6">
      {/* Create */}
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Create Lobby</h2>
        <p className="text-gray-400 text-sm mb-4">
          Create a lobby and share the code with your fireteam.
        </p>
        <button
          onClick={handleCreate}
          disabled={loading !== null}
          className="w-full bg-bungie-blue hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {loading === "create" ? "Creating..." : "Create Lobby"}
        </button>
      </div>

      {/* Join */}
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Join Lobby</h2>
        <p className="text-gray-400 text-sm mb-4">
          Got a code? Enter it here.
        </p>
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            className="flex-1 bg-bungie-dark border border-bungie-border rounded-lg px-3 py-2 text-white font-mono text-center uppercase tracking-widest focus:outline-none focus:border-bungie-blue"
          />
          <button
            type="submit"
            disabled={loading !== null || !code.trim()}
            className="bg-bungie-blue hover:opacity-90 disabled:opacity-50 text-white font-semibold px-4 rounded-lg transition"
          >
            {loading === "join" ? "..." : "Join"}
          </button>
        </form>
      </div>

      {error && (
        <div className="md:col-span-2 text-red-400 text-sm text-center">
          {error}
        </div>
      )}
    </div>
    </div>
  );
}
