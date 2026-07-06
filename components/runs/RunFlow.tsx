"use client";

// Shared solo-run flow for Score Attack and Weekly Challenge (#246/#252):
// start → roll (with rerolls) → pick character → apply → track → score.
// The two modes share the lifecycle but not the look — each passes its own
// accent so the flow inherits the activity's visual identity.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dices, RotateCcw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import BungieReauthPrompt from "@/components/BungieReauthPrompt";
import WeaponIcon from "@/components/WeaponIcon";
import { isBungieAuthErrorMessage } from "@/lib/auth/bungieErrors";
import type { WeaponSlot } from "@/types/bungie";

type Accent = "amber" | "blue";

const ACCENT = {
  amber: {
    text: "text-amber-400",
    borderL: "border-l-amber-400/40",
    button: "bg-amber-500 hover:bg-amber-400 text-black",
    ring: "border-amber-400",
  },
  blue: {
    text: "text-bungie-blue",
    borderL: "border-l-bungie-blue/40",
    button: "bg-bungie-blue hover:bg-[#26bcf3] text-white",
    ring: "border-bungie-blue",
  },
} as const;

interface LoadoutSlot {
  slot: WeaponSlot;
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

interface RunState {
  id: string;
  status: string;
  score: number | null;
  scoringBreakdown: ScoringBreakdown | null;
  complianceStatus: string | null;
}

interface ScoringBreakdown {
  baseCompletionScore: number;
  rolledWeaponKills: number;
  rolledWeaponKillScore: number;
  rolledWeaponPrecisionKills: number;
  rolledWeaponPrecisionBonus: number;
  durationSeconds: number | null;
  timeBonus: number;
  timePenalty: number;
  deaths: number | null;
  deathPenalty: number;
  totalScore: number;
}

interface Character {
  characterId: string;
  classType: number;
  light: number;
  emblemPath: string;
}

interface ApplyResultRow {
  slot: string;
  success: boolean;
  error?: string;
  weapon_name?: string;
}

const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };

// Worker-owned pipeline states shown while we wait on detection/scoring.
const TRACKING_STATES = new Set([
  "applied",
  "in_activity",
  "completed_pending_pgcr",
  "pgcr_fetched",
  "parsed",
]);
const DONE_STATES = new Set(["scored", "finalized"]);
const DEAD_STATES = new Set(["failed", "abandoned", "expired"]);

const POLL_INTERVAL_MS = 15_000;

interface Props {
  mode: "score_attack" | "weekly_challenge";
  weeklyChallengeId?: string;
  /** Human name of the activity to run, shown in the tracking step. */
  activityName?: string;
  accent: Accent;
}

export default function RunFlow({ mode, weeklyChallengeId, activityName, accent }: Props) {
  const a = ACCENT[accent];
  const storageKey = `activeRun:${mode}`;

  const [run, setRun] = useState<RunState | null>(null);
  const [loadout, setLoadout] = useState<LoadoutSlot[]>([]);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [rerollLimit, setRerollLimit] = useState(0);
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [applyResults, setApplyResults] = useState<ApplyResultRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const needsReauth = error ? isBungieAuthErrorMessage(error) : false;

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  }, []);

  const refreshRun = useCallback(
    async (runId: string) => {
      const data = await api(`/api/runs/${runId}`);
      const nextRun = data.run as RunState;
      if (nextRun.status === "created" && !(data.loadout?.length)) {
        localStorage.removeItem(storageKey);
        setRun(null);
        setLoadout([]);
        return null;
      }
      setRun(nextRun);
      if (data.loadout?.length) setLoadout(data.loadout);
      return nextRun;
    },
    [api, storageKey]
  );

  // Resume an in-flight run after a reload so leaving the page mid-run doesn't
  // orphan the flow (the worker keeps scoring it either way).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (!saved) return;
    refreshRun(saved).catch(() => localStorage.removeItem(storageKey));
  }, [storageKey, refreshRun]);

  // Poll while the worker pipeline is running.
  useEffect(() => {
    if (!run || !TRACKING_STATES.has(run.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => {
      refreshRun(run.id).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run, refreshRun]);

  const startRun = async () => {
    setBusy("start");
    setError(null);
    try {
      const created = await api("/api/runs/create", {
        method: "POST",
        body: JSON.stringify({ mode, weeklyChallengeId: weeklyChallengeId ?? null }),
      });
      const rolled = await api(`/api/runs/${created.runId}/roll`, { method: "POST" });
      localStorage.setItem(storageKey, created.runId);
      setLoadout(rolled.loadout);
      setRerollsUsed(rolled.rerollsUsed);
      setRerollLimit(rolled.rerollLimit);
      setRun({ id: created.runId, status: "loadout_rolled", score: null, scoringBreakdown: null, complianceStatus: null });
      // Load characters in the background for the next step.
      api("/api/bungie/characters")
        .then((d) => setCharacters(d.characters))
        .catch(() => setCharacters([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the run");
    } finally {
      setBusy(null);
    }
  };

  const reroll = async () => {
    if (!run) return;
    setBusy("reroll");
    setError(null);
    try {
      const rolled = await api(`/api/runs/${run.id}/roll`, { method: "POST" });
      setLoadout(rolled.loadout);
      setRerollsUsed(rolled.rerollsUsed);
      setRerollLimit(rolled.rerollLimit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reroll failed");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!run || !characterId) return;
    setBusy("apply");
    setError(null);
    try {
      const data = await api(`/api/runs/${run.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ characterId }),
      });
      setApplyResults(data.results);
      await refreshRun(run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  };

  const abandon = async () => {
    if (!run) return;
    setBusy("abandon");
    setError(null);
    try {
      await api(`/api/runs/${run.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ next: "abandoned" }),
      });
    } catch {
      // Terminal either way — clear local state below.
    }
    localStorage.removeItem(storageKey);
    setRun(null);
    setLoadout([]);
    setApplyResults(null);
    setBusy(null);
  };

  const reset = () => {
    localStorage.removeItem(storageKey);
    setRun(null);
    setLoadout([]);
    setApplyResults(null);
    setRerollsUsed(0);
    setError(null);
  };

  // Lazily fetch characters when resuming into the rolled state.
  useEffect(() => {
    if (run?.status === "loadout_rolled" && characters === null) {
      api("/api/bungie/characters")
        .then((d) => setCharacters(d.characters))
        .catch(() => setCharacters([]));
    }
  }, [run?.status, characters, api]);

  // ── render ────────────────────────────────────────────────────────────────

  if (!run) {
    return (
      <div>
        <button
          type="button"
          onClick={startRun}
          disabled={busy !== null}
          className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors disabled:opacity-50 ${a.button}`}
        >
          {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
          {busy === "start" ? "Rolling…" : mode === "weekly_challenge" ? "Run the Weekly" : "Start a Run"}
        </button>
        {needsReauth ? (
          <div className="mt-4">
            <BungieReauthPrompt message="Your Bungie connection needs to be refreshed before we can roll from your live inventory." />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 mt-3">{error}</p>
        ) : null}
      </div>
    );
  }

  if (DEAD_STATES.has(run.status)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400">
          {run.status === "failed"
            ? "Scoring failed for this run — the clear couldn't be verified."
            : "This run ended without a scored clear."}
        </p>
        <button
          type="button"
          onClick={reset}
          className={`text-xs font-bold uppercase tracking-wider px-4 py-2 ${a.button}`}
        >
          Start a new run
        </button>
      </div>
    );
  }

  if (DONE_STATES.has(run.status)) {
    const b = run.scoringBreakdown;
    return (
      <div className="space-y-4">
        <div className="flex items-end gap-4">
          <div>
            <p className="section-label mb-1">Final score</p>
            <p className={`text-4xl font-bold font-mono slashed-zero leading-none ${a.text}`}>
              {(run.score ?? 0).toLocaleString()}
            </p>
          </div>
          {run.complianceStatus && run.complianceStatus !== "eligible" && (
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border text-yellow-400 border-yellow-400/40 mb-1">
              {run.complianceStatus}
            </span>
          )}
        </div>

        {b && (
          <div className="text-xs text-gray-400 space-y-1">
            <BreakdownRow label="Completion" value={b.baseCompletionScore} />
            <BreakdownRow label={`Rolled-weapon kills (${b.rolledWeaponKills})`} value={b.rolledWeaponKillScore} />
            <BreakdownRow label={`Precision kills (${b.rolledWeaponPrecisionKills})`} value={b.rolledWeaponPrecisionBonus} />
            {b.timeBonus > 0 && <BreakdownRow label="Time bonus" value={b.timeBonus} />}
            {b.timePenalty > 0 && <BreakdownRow label="Time penalty" value={-b.timePenalty} />}
            {(b.deaths ?? 0) > 0 && <BreakdownRow label={`Deaths (${b.deaths})`} value={-b.deathPenalty} />}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2 ${a.button}`}
          >
            Run it again
          </button>
          {mode === "weekly_challenge" && (
            <Link
              href="/weekly/leaderboard"
              className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-white"
            >
              View leaderboard →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (TRACKING_STATES.has(run.status)) {
    return (
      <div className="space-y-4">
        <LoadoutRow loadout={loadout} accent={accent} />

        {applyResults?.some((r) => !r.success) && (
          <div className="space-y-1">
            {applyResults.filter((r) => !r.success).map((r, i) => (
              <p key={i} className="text-xs text-red-400 flex items-center gap-1.5">
                <XCircle size={12} className="shrink-0" /> {r.weapon_name ?? r.slot}: {r.error}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Loader2 size={14} className={`animate-spin ${a.text}`} />
          {run.status === "applied" || run.status === "in_activity" ? (
            <span>
              Loadout equipped — launch {activityName ?? "your activity"} in-game. The clear is
              detected and scored automatically.
            </span>
          ) : (
            <span>Clear detected — fetching the report and scoring your run…</span>
          )}
        </div>

        <button
          type="button"
          onClick={abandon}
          disabled={busy !== null}
          className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-400 disabled:opacity-50"
        >
          Abandon run
        </button>
        {needsReauth ? (
          <BungieReauthPrompt message="Your Bungie connection expired while this run was active. Reconnect it, then try again." />
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : null}
      </div>
    );
  }

  // loadout_rolled (or created, momentarily): show the roll + character picker.
  return (
    <div className="space-y-5">
      <LoadoutRow loadout={loadout} accent={accent} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reroll}
          disabled={busy !== null || rerollsUsed >= rerollLimit}
          className="inline-flex items-center gap-1.5 border border-bungie-border text-gray-300 hover:border-gray-400 text-xs font-bold uppercase tracking-wider px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === "reroll" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          Reroll ({Math.max(0, rerollLimit - rerollsUsed)} left)
        </button>
      </div>

      <div>
        <p className="section-label mb-2">Equip on</p>
        {characters === null ? (
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Loading characters…
          </p>
        ) : characters.length === 0 ? (
          <p className="text-xs text-red-400">Couldn&apos;t load your characters — try refreshing.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {characters.map((c) => (
              <button
                key={c.characterId}
                type="button"
                onClick={() => setCharacterId(c.characterId)}
                className={`flex items-center gap-2 border px-3 py-2 text-xs transition-colors ${
                  characterId === c.characterId
                    ? `${a.ring} text-white`
                    : "border-bungie-border text-gray-400 hover:border-gray-400"
                }`}
              >
                {characterId === c.characterId && <CheckCircle2 size={12} className={a.text} />}
                <span className="font-bold uppercase tracking-wider">
                  {CLASS_NAMES[c.classType] ?? "Guardian"}
                </span>
                <span className="font-mono slashed-zero text-gray-500">✦{c.light}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={busy !== null || !characterId}
          className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors disabled:opacity-50 ${a.button}`}
        >
          {busy === "apply" && <Loader2 size={14} className="animate-spin" />}
          {busy === "apply" ? "Equipping…" : "Apply & Start"}
        </button>
        <button
          type="button"
          onClick={abandon}
          disabled={busy !== null}
          className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-400 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {needsReauth ? (
        <BungieReauthPrompt message="Your Bungie connection needs to be refreshed before we can continue this run." />
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between max-w-xs">
      <span>{label}</span>
      <span className={`font-mono slashed-zero ${value < 0 ? "text-red-400" : "text-gray-300"}`}>
        {value < 0 ? "−" : "+"}
        {Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}

function LoadoutRow({ loadout, accent }: { loadout: LoadoutSlot[]; accent: Accent }) {
  const a = ACCENT[accent];
  if (!loadout.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {loadout.map((w) => (
        <div key={w.slot} className={`panel border-l-2 ${a.borderL} p-3 flex items-center gap-3`}>
          {w.icon ? (
            <WeaponIcon icon={w.icon} name={w.name} size="large" />
          ) : (
            // Wildcard slot — the ruleset lets the player bring their own weapon.
            <div className="w-12 h-12 shrink-0 bg-bungie-dark border border-bungie-border flex items-center justify-center text-lg font-bold text-gray-500">
              ?
            </div>
          )}
          <div className="min-w-0">
            <p className="section-label">{w.slot}</p>
            <p className="text-sm font-bold text-white truncate">{w.name}</p>
            <p className="text-[11px] text-gray-500">{w.weaponType}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
