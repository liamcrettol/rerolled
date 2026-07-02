"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle, LogIn } from "lucide-react";
import Spinner from "./Spinner";
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
  const [loading, setLoading] = useState<"join" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <div
          className="glass-card ring-1 ring-bungie-blue/40 rounded-xl p-4 flex items-center justify-between gap-4 animate-rise-in"
          style={{ opacity: 0 }}
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bungie-blue opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bungie-blue" />
            </span>
            <div>
              <p className="text-white font-semibold text-sm">Active session detected</p>
              <p className="text-gray-400 text-xs mt-0.5">
                <span className="font-mono text-bungie-blue slashed-zero">{activeSession.code}</span>
                {" · "}
                {STATUS_LABELS[activeSession.status]}
              </p>
            </div>
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
        <div
          className="glass-card rounded-xl p-6 flex flex-col gap-4 transition hover:-translate-y-1 hover:ring-1 hover:ring-bungie-blue/40 animate-rise-in"
          style={{ opacity: 0, animationDelay: "80ms" }}
        >
          <div>
            <PlusCircle size={22} className="text-bungie-blue mb-2" />
            <h2 className="text-lg font-semibold text-white mb-1">Create Lobby</h2>
            <p className="text-gray-400 text-sm">
              Configure roll settings and share the code with your fireteam.
            </p>
          </div>
          <Link
            href="/lobby/new"
            className="mt-auto w-full bg-bungie-blue hover:opacity-90 text-white font-semibold py-2.5 rounded-lg transition text-center text-sm"
          >
            Create Lobby
          </Link>
        </div>

        {/* Join */}
        <div
          className="glass-card rounded-xl p-6 transition hover:-translate-y-1 hover:ring-1 hover:ring-bungie-blue/40 animate-rise-in"
          style={{ opacity: 0, animationDelay: "160ms" }}
        >
          <LogIn size={22} className="text-bungie-blue mb-2" />
          <h2 className="text-lg font-semibold text-white mb-1">Join Lobby</h2>
          <p className="text-gray-400 text-sm mb-4">
            Enter a lobby code from your fireteam.
          </p>
          <form onSubmit={handleJoin} className="flex gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Lobby code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="ABC123"
                maxLength={8}
                className="w-full bg-bungie-dark border border-bungie-border rounded-lg px-3 py-2 text-white font-mono text-center uppercase tracking-widest slashed-zero focus:outline-none focus:border-bungie-blue"
              />
            </label>
            <button
              type="submit"
              disabled={loading !== null || !code.trim()}
              className={`font-semibold px-4 rounded-lg transition inline-flex items-center justify-center gap-2 ${
                code.trim()
                  ? "bg-bungie-blue hover:opacity-90 text-white"
                  : "bg-bungie-dark border border-bungie-border text-gray-500"
              } disabled:opacity-50`}
            >
              {loading === "join" && <Spinner size={14} />}
              {loading === "join" ? "Joining..." : "Join"}
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
