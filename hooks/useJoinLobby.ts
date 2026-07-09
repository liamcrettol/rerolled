"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LobbyMode } from "@/types/lobby";

// A lobby's mode determines which board it lives on. Rejoin and post-join
// routing derive from this rather than trusting the caller's joinBasePath,
// since your active lobby (or the code you just typed in) isn't necessarily
// the same mode as whatever page you're standing on.
export const MODE_BASE_PATH: Record<LobbyMode, string> = {
  roulette: "/lobby",
  draft: "/draft",
  endgame: "/endgame/lobby",
};

const JOIN_TIMEOUT_MS = 2_500;

// Shared by LobbyControls (the wide /endgame panel) and JoinLobbyCard (the
// dashboard mode-grid tile). Both need the same abort timeout and the same
// mode-aware redirect, and neither should be the place that logic lives.
export function useJoinLobby(joinBasePath = "/lobby") {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCodeChange = (raw: string) => setCode(raw.toUpperCase().replace(/\s+/g, ""));

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), JOIN_TIMEOUT_MS);
    try {
      const res = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const base = (data.mode && MODE_BASE_PATH[data.mode as LobbyMode]) || joinBasePath;
      router.push(`${base}/${data.code}`);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setError(
        timedOut
          ? "This needs the database, and Supabase is timing out right now. Please try again in a minute."
          : e instanceof Error
            ? e.message
            : "Failed to join lobby"
      );
      // Only clear on failure — on success the route change unmounts us, and
      // dropping the spinner first would flash an idle button mid-navigation.
      setLoading(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return { code, onCodeChange, loading, error, join, router };
}
