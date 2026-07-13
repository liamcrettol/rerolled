"use client";

import { useEffect, useState } from "react";
import { Loader2, Shield, Swords, Target } from "lucide-react";
import BungieReauthPrompt from "@/components/BungieReauthPrompt";
import WeaponIcon from "@/components/WeaponIcon";
import { isBungieAuthErrorMessage } from "@/lib/auth/bungieErrors";
import type { EndgameActivityKind } from "@/lib/endgame/randomizer";

interface Character {
  characterId: string;
  classType: number;
  light: number;
  emblemPath: string;
}

interface RollResult {
  character: {
    characterId: string;
    classType: number;
    className: string;
    light: number;
    emblemPath: string;
  };
  activity: {
    activityHash: number;
    name: string;
    kind: EndgameActivityKind;
    label: string;
  };
  loadout: Array<{
    slot: "kinetic" | "energy" | "power";
    itemHash: number;
    name: string;
    icon: string;
    weaponType: string;
    damageType: string;
  }>;
  exoticArmor: {
    itemHash: number;
    itemInstanceId: string;
    name: string;
    icon: string;
    slotLabel: string;
    classType: number;
    location: "character" | "vault";
    characterId?: string;
    isEquipped: boolean;
  };
}

const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
const KIND_LABELS: Record<EndgameActivityKind, string> = {
  grandmaster: "Grandmaster",
  dungeon: "Dungeon",
  raid: "Raid",
};
const KIND_ORDER: EndgameActivityKind[] = ["grandmaster", "dungeon", "raid"];

function armorLocationLabel(
  armor: RollResult["exoticArmor"],
  selectedCharacterId: string | null
): string {
  if (armor.characterId && armor.characterId === selectedCharacterId) {
    return armor.isEquipped ? "Already on this character" : "On this character";
  }
  if (armor.location === "vault") return "In your vault";
  return armor.isEquipped ? "Equipped on another character" : "On another character";
}

export default function EndgameRandomizer() {
  const [characters, setCharacters] = useState<Character[] | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [selectedKinds, setSelectedKinds] = useState<EndgameActivityKind[]>(["grandmaster", "dungeon", "raid"]);
  const [result, setResult] = useState<RollResult | null>(null);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReauth = error ? isBungieAuthErrorMessage(error) : false;

  useEffect(() => {
    let cancelled = false;
    setLoadingCharacters(true);
    fetch("/api/bungie/characters")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const nextCharacters = (data.characters as Character[]) ?? [];
        setCharacters(nextCharacters);
        setCharacterId((current) => current ?? nextCharacters[0]?.characterId ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load your characters.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCharacters(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleKind = (kind: EndgameActivityKind) => {
    setSelectedKinds((current) => {
      if (current.includes(kind)) {
        return current.length > 1 ? current.filter((value) => value !== kind) : current;
      }
      return [...current, kind];
    });
  };

  const roll = async () => {
    if (!characterId || selectedKinds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/endgame/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, activityKinds: selectedKinds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setResult(data as RollResult);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Couldn't roll your endgame run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel border-l-2 border-l-red-400 p-5 space-y-4">
          <div>
            <p className="section-label text-red-400 mb-2">Choose Character</p>
            {loadingCharacters ? (
              <div className="flex flex-wrap gap-2" role="status" aria-label="Loading characters">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[34px] w-24 border border-bungie-border bg-bungie-border/20 animate-pulse" />
                ))}
              </div>
            ) : needsReauth && (!characters || characters.length === 0) ? (
              <p className="text-xs text-amber-400">Your Bungie connection needs to be refreshed.</p>
            ) : error && (!characters || characters.length === 0) ? (
              <p className="text-xs text-red-400">Couldn&apos;t load your Bungie characters right now.</p>
            ) : (characters?.length ?? 0) === 0 ? (
              <p className="text-xs text-red-400">No characters found for this Bungie account.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(characters ?? []).map((character) => {
                  const active = characterId === character.characterId;
                  return (
                    <button
                      key={character.characterId}
                      type="button"
                      onClick={() => setCharacterId(character.characterId)}
                      className={`flex items-center gap-2 border px-3 py-2 text-xs transition-colors ${
                        active
                          ? "border-red-400 text-white"
                          : "border-bungie-border text-gray-400 hover:border-gray-400"
                      }`}
                    >
                      <span className="font-bold uppercase tracking-wider">
                        {CLASS_NAMES[character.classType] ?? "Guardian"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="section-label text-red-400 mb-2">Roll From</p>
            <div className="flex flex-wrap gap-2">
              {KIND_ORDER.map((kind) => {
                const active = selectedKinds.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleKind(kind)}
                    className={`text-xs font-bold uppercase tracking-wider border px-3 py-2 transition-colors ${
                      active
                        ? "border-red-400 text-white"
                        : "border-bungie-border text-gray-500 hover:border-gray-400"
                    }`}
                  >
                    {KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Pick one pool or leave multiple active to randomize across all of them.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={roll}
              disabled={busy || !characterId || loadingCharacters || (characters?.length ?? 0) === 0}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-3 bg-red-500 hover:bg-red-400 text-white transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
              {busy ? "Rolling..." : "Roll Endgame"}
            </button>
          </div>
        </div>
      </div>

      {needsReauth ? (
        <BungieReauthPrompt />
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : null}

      {result && (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <div className="panel border-l-2 border-l-red-400 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} className="text-red-400" />
                <p className="section-label text-red-400">Rolled Activity</p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{result.activity.label}</p>
              <h3 className="text-xl font-bold uppercase tracking-wide text-white mt-2">
                {result.activity.name}
              </h3>
            </div>

            <div className="panel p-5">
              <p className="section-label mb-3">Rolled Loadout</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {result.loadout.map((weapon) => (
                  <div key={weapon.slot} className="border border-bungie-border bg-bungie-dark/50 p-3 flex items-center gap-3">
                    <WeaponIcon icon={weapon.icon} name={weapon.name} size="large" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{weapon.slot}</p>
                      <p className="text-sm font-bold text-white truncate">{weapon.name}</p>
                      <p className="text-xs text-gray-400">
                        {weapon.weaponType} · {weapon.damageType}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-red-400" />
              <p className="section-label text-red-400">Forced Exotic</p>
            </div>
            <div className="flex items-center gap-3 border border-bungie-border bg-bungie-dark/50 p-3">
              <WeaponIcon icon={result.exoticArmor.icon} name={result.exoticArmor.name} size="large" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {result.exoticArmor.slotLabel}
                </p>
                <p className="text-sm font-bold text-white truncate">{result.exoticArmor.name}</p>
                <p className="text-xs text-gray-400">
                  {armorLocationLabel(result.exoticArmor, characterId)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-3">
              Roll belongs to your {result.character.className} at {result.character.light} Power.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
