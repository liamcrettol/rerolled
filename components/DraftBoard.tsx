"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import DraftLeaveButton from "@/components/draft/DraftLeaveButton";
import Spinner from "./Spinner";
import PlayerCard from "./PlayerCard";
import { RollRow } from "./WeaponPool";
import { useRollInstances } from "@/hooks/lobby/useRollInstances";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseChannel, type SupabaseChannel } from "@/hooks/useSupabaseChannel";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

// How long a player gets to pick which owned copy (roll) of a drafted weapon
// to equip, once all 3 slots are locked, before it auto-selects for them.
const ROLL_PICKER_MS = 10_000;

const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];
const SLOT_LABELS: Record<WeaponSlot, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};
const CLASS_LABELS: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };

// Destiny element colors — used for the rarity-style edge glow a card lights up
// with once its reel lands, so the reveal reads like a real loadout roll.
const DAMAGE_COLORS: Record<string, string> = {
  Arc: "#7bd6ff",
  Solar: "#ff8a3d",
  Void: "#b58cff",
  Stasis: "#5b8dff",
  Strand: "#2fd66f",
  Kinetic: "#d3dae1",
};
const damageColor = (d: string) => DAMAGE_COLORS[d] ?? "#9aa1a9";

interface DraftOption {
  position: number;
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

interface Props {
  lobby: Lobby;
  members: LobbyMember[];
  currentUserId: string;
}

// ─── Reel card ────────────────────────────────────────────────────────────
// One revealed option. On first mount (spin=true) it runs a single scroll-and-
// land pass — the same mechanic as the signed-out home HeroReel — cycling
// blurred filler icons and notching onto its real weapon, then lighting a
// element-colored edge. Captain taps a landed card to lock the slot.
const CARD_ICON = 112;
const CARD_WINDOW = 144;
const cardOffset = (i: number) => (CARD_WINDOW - CARD_ICON) / 2 - i * CARD_ICON;
const REEL_MASK =
  "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)";

function DraftCard({
  option,
  fillers,
  spin,
  delay,
  disabled,
  selected,
  dimmed,
  voteCount,
  onPick,
}: {
  option: DraftOption;
  fillers: string[];
  spin: boolean;
  delay: number;
  disabled: boolean;
  selected: boolean;
  dimmed: boolean;
  /** Vote tally for this option in a multi-member lobby (#315) - omitted entirely
   * in solo lobbies, which keep the old instant-pick behavior with no voting. */
  voteCount?: number;
  onPick: () => void;
}) {
  const reelRef = useRef<HTMLDivElement>(null);
  // Captured once at mount rather than tracking the live `spin` prop: this
  // card stays mounted (stable key) for the rest of the reveal, and a
  // realtime refetch (options insert echoing back over the lobby_draft_options
  // subscription) re-renders the parent mid-animation, which flips `spin`
  // back to false once the slot is marked "already animated". If the effect
  // below depended on that live prop, React's dependency-change cleanup would
  // cancel the pending landed-timer before it fires, leaving the card
  // permanently blurred and unclickable.
  const [spinAtMount] = useState(spin);
  const [landed, setLanded] = useState(!spinAtMount);

  // [ ...blurred fillers, the real weapon ]. Rebuilt only when the reel arms.
  const items = useMemo(() => {
    if (!spinAtMount) return [option.icon];
    const pool = fillers.length ? fillers : [option.icon];
    const scroll = Array.from(
      { length: 14 },
      () => pool[Math.floor(Math.random() * pool.length)]
    );
    return [...scroll, option.icon];
  }, [spinAtMount, option.icon, fillers]);

  useEffect(() => {
    if (!spinAtMount) return;
    const reel = reelRef.current;
    if (!reel) return;
    reel.style.transition = "none";
    reel.style.transform = `translateY(${cardOffset(0)}px)`;
    void reel.offsetHeight; // commit the reset before the animated move
    const start = setTimeout(() => {
      reel.style.transition = "transform 1150ms cubic-bezier(0.16, 1, 0.3, 1)";
      reel.style.transform = `translateY(${cardOffset(items.length - 1)}px)`;
    }, delay);
    const done = setTimeout(() => setLanded(true), delay + 1250);
    return () => {
      clearTimeout(start);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = damageColor(option.damageType);
  const glow = selected
    ? `0 0 0 2px ${color}, 0 0 34px -4px ${color}`
    : landed
      ? `0 0 0 1px ${color}66, 0 0 26px -8px ${color}88`
      : "none";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || !landed}
    className={`group relative flex w-[min(18rem,calc(100vw-3rem))] shrink-0 flex-col items-center gap-3 bg-bungie-dark border p-4 transition-all duration-300 ${
        selected ? "border-transparent animate-pick-pop" : "border-bungie-border"
      } ${dimmed ? "opacity-30" : "opacity-100"} ${
        landed && !disabled ? "cursor-pointer hover:border-white/40" : "cursor-default"
      }`}
      style={{ boxShadow: glow }}
    >
      {!!voteCount && (
        <span className="absolute top-1.5 left-1.5 z-10 bg-bungie-blue px-1.5 py-0.5 text-[10px] font-bold text-white">
          {voteCount}
        </span>
      )}
      <div
        className="relative overflow-hidden"
        style={{ width: CARD_ICON, height: CARD_WINDOW }}
      >
        <div
          className="h-full"
          style={{ maskImage: REEL_MASK, WebkitMaskImage: REEL_MASK }}
        >
          <div
            ref={reelRef}
            style={{
              transform: `translateY(${cardOffset(0)}px)`,
              willChange: "transform",
            }}
          >
            {items.map((ic, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={ic}
                alt=""
                loading="eager"
                decoding="async"
                style={{
                  width: CARD_ICON,
                  height: CARD_ICON,
                  objectFit: "cover",
                  display: "block",
                  filter: landed && i === items.length - 1 ? "none" : "blur(3px)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className={`text-center transition-opacity duration-300 ${
          landed ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="text-sm font-bold leading-tight text-white">{option.name}</div>
        <div
          className="mt-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color }}
        >
          {option.damageType} · {option.weaponType}
        </div>
      </div>
    </button>
  );
}

// Pre-reveal placeholder — a face-down "mystery" tile, Clash-Royale style.
function CardBack({ pulse }: { pulse: boolean }) {
  return (
    <div
      className={`flex w-[min(18rem,calc(100vw-3rem))] shrink-0 flex-col items-center justify-center gap-3 border border-dashed border-bungie-border bg-bungie-dark/60 p-4 ${
        pulse ? "animate-pulse" : ""
      }`}
      style={{ minHeight: CARD_WINDOW + 72 }}
    >
      <div
        className="flex items-center justify-center text-3xl font-black text-bungie-blue/70"
        style={{ width: CARD_ICON, height: CARD_WINDOW }}
      >
        ?
      </div>
    </div>
  );
}

export default function DraftBoard({ lobby, members, currentUserId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isCaptain = lobby.captain_user_id === currentUserId;

  const [roundId, setRoundId] = useState<string | null>(null);
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>([]);
  const [options, setOptions] = useState<Partial<Record<WeaponSlot, DraftOption[]>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // The intersection call that primes lobby_pools does live Bungie API
  // fetches and typically takes a couple seconds - without this gate, a
  // captain landing straight on the board (#279) could hit Reveal before the
  // pool finished caching and get "no shared weapon pool cached yet" for a
  // pool that was actually fine, just not written yet (#313).
  const [poolReady, setPoolReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [pickingHash, setPickingHash] = useState<number | null>(null);
  const [characters, setCharacters] = useState<{ characterId: string; classType: number }[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [roster, setRoster] = useState(members);
  // Votes per slot for the current round (#315) - only meaningful in
  // multi-member lobbies; solo lobbies keep the old captain-taps-to-lock flow.
  const [votes, setVotes] = useState<Partial<Record<WeaponSlot, { voterUserId: string; itemHash: number }[]>>>({});
  // Earliest lobby_draft_options.created_at per slot, the clock the 30s
  // auto-pick timer counts down from - server-owned so a page reload doesn't
  // reset it.
  const [revealedAt, setRevealedAt] = useState<Partial<Record<WeaponSlot, string>>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Slots whose reveal animation has already fired, so re-renders (realtime
  // refetches) don't replay the reel every time.
  const animatedRef = useRef<Set<WeaponSlot>>(new Set());

  // Per-player "choose your roll" step (#roll-picker): once the fireteam's
  // loadout is locked, a player who owns multiple copies of a drafted weapon
  // gets ROLL_PICKER_MS to pick which specific one to equip. This is entirely
  // local/client-side (mirrors the roulette flow's useRollInstances - instance
  // choice is never synced or persisted, just read at apply time), so it
  // doesn't need the server-owned-clock treatment the vote timer above does.
  const { rollsData, myChosenInstances, rollsLoading, favorites, toggleFavorite, handleChooseInstance } =
    useRollInstances(lobby.id, roundId, slots);
  const [rollPickerDone, setRollPickerDone] = useState(false);
  const [rollPickerStartedAt, setRollPickerStartedAt] = useState<number | null>(null);
  const [rollNowTick, setRollNowTick] = useState(() => Date.now());
  // Slots the player explicitly picked a roll for - untouched slots fall back
  // to their favorited roll (already the hook's default) or a random owned
  // copy when the timer runs out.
  const touchedRollSlotsRef = useRef<Set<WeaponSlot>>(new Set());

  const nonSpectatorMembers = useMemo(() => roster.filter((m) => !m.is_spectator), [roster]);
  // A lobby of just the captain has nothing to vote on - keep the original
  // instant tap-to-lock behavior instead of running a pointless vote/timer.
  const isSolo = nonSpectatorMembers.length <= 1;
  const isSpectator = roster.find((m) => m.user_id === currentUserId)?.is_spectator ?? false;

  const nameFor = useCallback(
    (userId: string) => roster.find((m) => m.user_id === userId)?.display_name ?? userId,
    [roster]
  );

  // Same copy-to-clipboard pattern LobbyRoom uses for its lobby code (#314).
  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable; ignore */ }
  }, [lobby.code]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${lobby.code}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch { /* clipboard unavailable; ignore */ }
  }, [lobby.code]);

  const loadRound = useCallback(async () => {
    const { data: round } = await supabase
      .from("lobby_rounds")
      .select("id")
      .eq("lobby_id", lobby.id)
      .eq("round_number", lobby.current_round)
      .single();
    if (!round) return;
    setRoundId(round.id);

    const [{ data: existingSlots }, { data: existingOptions }, { data: existingVotes }, { data: currentMembers }] = await Promise.all([
      supabase.from("lobby_loadout_slots").select("*").eq("round_id", round.id),
      supabase.from("lobby_draft_options").select("*").eq("round_id", round.id),
      supabase.from("lobby_draft_votes").select("*").eq("round_id", round.id),
      supabase.from("lobby_members").select("*").eq("lobby_id", lobby.id),
    ]);
    setSlots(existingSlots ?? []);
    if (currentMembers) {
      setRoster((previous) => currentMembers.map((member) => ({
        ...(previous.find((old) => old.id === member.id) ?? {}),
        ...member,
      })) as typeof members);
    }

    const grouped: Partial<Record<WeaponSlot, DraftOption[]>> = {};
    const revealed: Partial<Record<WeaponSlot, string>> = {};
    for (const row of existingOptions ?? []) {
      const slot = row.slot as WeaponSlot;
      grouped[slot] = [
        ...(grouped[slot] ?? []),
        { position: row.position, itemHash: row.item_hash, name: row.weapon_name, icon: row.weapon_icon, weaponType: row.weapon_type, damageType: row.damage_type },
      ].sort((a, b) => a.position - b.position);
      if (!revealed[slot] || row.created_at < revealed[slot]!) revealed[slot] = row.created_at;
    }
    setOptions(grouped);
    setRevealedAt(revealed);

    const votesGrouped: Partial<Record<WeaponSlot, { voterUserId: string; itemHash: number }[]>> = {};
    for (const row of existingVotes ?? []) {
      const slot = row.slot as WeaponSlot;
      votesGrouped[slot] = [
        ...(votesGrouped[slot] ?? []),
        { voterUserId: row.voter_user_id, itemHash: row.item_hash },
      ];
    }
    setVotes(votesGrouped);
  }, [supabase, lobby.id, lobby.current_round]);

  useEffect(() => {
    // Ensures the shared weapon pool is cached (lobby_pools) so the reveal has
    // something to draw from — same call the roulette flow makes. Reveal stays
    // disabled until this resolves (see poolReady) so the captain can't race it.
    fetch("/api/roulette/intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load the shared weapon pool");
        setPoolReady(true);
      })
      .catch(() => setError("Failed to load the shared weapon pool"));
    loadRound().finally(() => setLoading(false));
  }, [lobby.id, loadRound]);

  const configureChannel = useCallback(
    (channel: SupabaseChannel) => {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_draft_options" },
          () => loadRound()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_loadout_slots" },
          () => loadRound()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_draft_votes" },
          () => loadRound()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_members" },
          () => loadRound()
        );
    },
    [loadRound]
  );
  useSupabaseChannel(`draft:${lobby.id}`, configureChannel);

  const committedSlots = new Set(slots.map((s) => s.slot));
  const complete = SLOT_ORDER.every((s) => committedSlots.has(s));
  const activeSlot = SLOT_ORDER.find((s) => !committedSlots.has(s)) ?? null;
  const doneCount = committedSlots.size;

  // Slots where I own more than one copy of the drafted weapon - only these
  // get a roll picker; nothing to choose otherwise.
  const multiRollSlots = SLOT_ORDER.filter(
    (slot) => committedSlots.has(slot) && (rollsData[slot]?.members.find((m) => m.isMe)?.instances.length ?? 0) > 1
  );
  const showRollPicker = complete && !rollPickerDone && !rollsLoading && multiRollSlots.length > 0;

  const finishRollPicker = useCallback(() => {
    for (const slot of multiRollSlots) {
      if (touchedRollSlotsRef.current.has(slot)) continue;
      const rd = rollsData[slot];
      const mine = rd?.members.find((m) => m.isMe)?.instances ?? [];
      if (mine.length === 0) continue;
      const favId = favorites[rd!.itemHash.toString()];
      const hasFavorite = favId && mine.some((i) => i.instanceId === favId);
      if (!hasFavorite) {
        const randomInst = mine[Math.floor(Math.random() * mine.length)];
        handleChooseInstance(slot, randomInst.instanceId);
      }
    }
    setRollPickerDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiRollSlots, rollsData, favorites, handleChooseInstance]);

  const chooseRoll = useCallback(
    (slot: WeaponSlot, instanceId: string) => {
      touchedRollSlotsRef.current.add(slot);
      handleChooseInstance(slot, instanceId);
    },
    [handleChooseInstance]
  );

  // New round: reset the picker so it can run again next round.
  useEffect(() => {
    touchedRollSlotsRef.current = new Set();
    setRollPickerDone(false);
    setRollPickerStartedAt(null);
  }, [roundId]);

  useEffect(() => {
    if (!showRollPicker) return;
    if (rollPickerStartedAt === null) {
      setRollPickerStartedAt(Date.now());
      return;
    }
    const deadline = rollPickerStartedAt + ROLL_PICKER_MS;
    const tickInterval = setInterval(() => setRollNowTick(Date.now()), 1000);
    const finishTimeout = setTimeout(finishRollPicker, Math.max(deadline - Date.now(), 0));
    return () => {
      clearInterval(tickInterval);
      clearTimeout(finishTimeout);
    };
  }, [showRollPicker, rollPickerStartedAt, finishRollPicker]);

  const rollSecondsLeft = rollPickerStartedAt
    ? Math.max(0, Math.ceil((rollPickerStartedAt + ROLL_PICKER_MS - rollNowTick) / 1000))
    : Math.ceil(ROLL_PICKER_MS / 1000);

  // A flat pool of every icon we've seen — feeds the reel's blurred pre-roll so
  // the spin scrolls through varied weapons rather than the same three.
  const fillerIcons = useMemo(() => {
    const set = new Set<string>();
    for (const slot of SLOT_ORDER) options[slot]?.forEach((o) => set.add(o.icon));
    slots.forEach((s) => set.add(s.weapon_icon));
    return [...set];
  }, [options, slots]);

  // Arm the reveal reel exactly once per slot, the moment its options arrive.
  const activeOptions = activeSlot ? options[activeSlot] ?? [] : [];
  const shouldSpin =
    activeSlot != null &&
    activeOptions.length > 0 &&
    !animatedRef.current.has(activeSlot);
  useEffect(() => {
    if (shouldSpin && activeSlot) animatedRef.current.add(activeSlot);
  }, [shouldSpin, activeSlot]);

  // 30s auto-pick fallback for multi-member lobbies (#315): every member's
  // client runs this same timer independently and calls /api/draft/resolve,
  // which is idempotent against an already-committed slot, so whichever
  // client's timer fires first just wins and the rest are no-ops. The 1s
  // interval only drives the visible countdown text.
  useEffect(() => {
    if (isSolo || !activeSlot || activeOptions.length === 0 || !roundId) return;
    const revealedIso = revealedAt[activeSlot];
    if (!revealedIso) return;
    const deadline = new Date(revealedIso).getTime() + 30_000;

    const tickInterval = setInterval(() => setNowTick(Date.now()), 1000);
    const resolveTimeout = setTimeout(() => {
      fetch("/api/draft/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot: activeSlot }),
      })
        .then(() => loadRound())
        .catch(() => {});
    }, Math.max(deadline - Date.now(), 0));

    return () => {
      clearInterval(tickInterval);
      clearTimeout(resolveTimeout);
    };
  }, [isSolo, activeSlot, activeOptions.length, revealedAt, roundId, lobby.id, loadRound]);

  useEffect(() => {
    if (!complete) return;
    let cancelled = false;
    setCharactersLoading(true);
    setCharacterError(null);
    fetch("/api/bungie/characters")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load your Destiny characters");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.characters?.length) {
          setCharacters(data.characters);
          setSelectedCharacterId(data.characters[0].characterId);
        } else {
          setCharacterError("No Destiny characters were returned. Retry before applying the loadout.");
        }
      })
      .catch((err) => {
        if (!cancelled) setCharacterError(err instanceof Error ? err.message : "Couldn't load your Destiny characters");
      })
      .finally(() => {
        if (!cancelled) setCharactersLoading(false);
      });
    return () => { cancelled = true; };
  }, [complete]);

  function retryCharacters() {
    setCharacters([]);
    setSelectedCharacterId("");
    setCharacterError(null);
    // Toggling the completion dependency is unnecessary. The fetch effect is
    // retriggered by this explicit event through the same endpoint.
    setCharactersLoading(true);
    fetch("/api/bungie/characters")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load your Destiny characters");
        return data;
      })
      .then((data) => {
        if (data.characters?.length) {
          setCharacters(data.characters);
          setSelectedCharacterId(data.characters[0].characterId);
        } else setCharacterError("No Destiny characters were returned. Retry before applying the loadout.");
      })
      .catch((err) => setCharacterError(err instanceof Error ? err.message : "Couldn't load your Destiny characters"))
      .finally(() => setCharactersLoading(false));
  }

  async function reveal(slot: WeaponSlot) {
    if (!roundId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reveal options");
    } finally {
      setBusy(false);
    }
  }

  async function pick(slot: WeaponSlot, itemHash: number) {
    if (!roundId) return;
    setPickingHash(itemHash);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot, itemHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pick");
    } finally {
      setBusy(false);
      setPickingHash(null);
    }
  }

  async function vote(slot: WeaponSlot, itemHash: number) {
    if (!roundId) return;
    setError(null);
    try {
      const res = await fetch("/api/draft/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot, itemHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to vote");
    }
  }

  async function applyLoadout() {
    if (!roundId || !selectedCharacterId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lobbyId: lobby.id,
          roundId,
          characterId: selectedCharacterId,
          preferredInstances: myChosenInstances,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply loadout");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  const activeVotes = activeSlot ? votes[activeSlot] ?? [] : [];
  const myVote = activeVotes.find((v) => v.voterUserId === currentUserId)?.itemHash;
  const voteCounts: Record<number, number> = {};
  for (const v of activeVotes) voteCounts[v.itemHash] = (voteCounts[v.itemHash] ?? 0) + 1;
  const secondsLeft =
    activeSlot && revealedAt[activeSlot]
      ? Math.max(0, 30 - Math.floor((nowTick - new Date(revealedAt[activeSlot]!).getTime()) / 1000))
      : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col gap-6">
      {/* Header: title, join code + invite, progress stepper */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="section-label">Draft</h1>
          <button
            onClick={copyCode}
            aria-label="Copy lobby code"
            className="font-mono slashed-zero text-bungie-blue hover:opacity-75 transition inline-flex items-center gap-1"
          >
            {copied ? <Check size={12} /> : lobby.code}
          </button>
          <button
            onClick={copyLink}
            className="text-[10px] px-2 py-0.5 border border-bungie-border/40 text-gray-500 hover:border-gray-500 transition inline-flex items-center gap-1"
          >
            {copiedLink ? <Check size={10} /> : <Copy size={10} />}
            {copiedLink ? "Copied" : "Invite"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SLOT_ORDER.map((slot) => {
            const isDone = committedSlots.has(slot);
            const isActive = slot === activeSlot;
            return (
              <div
                key={slot}
                className={`flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isDone
                    ? "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue"
                    : isActive
                      ? "border-white/40 text-white"
                      : "border-bungie-border text-gray-400"
                }`}
              >
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M2 6.5L5 9.5L10 3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="square"
                    />
                  </svg>
                )}
                {SLOT_LABELS[slot]}
              </div>
            );
          })}
          <DraftLeaveButton lobbyId={lobby.id} />
        </div>
      </div>

      {/* Fireteam roster — compact PlayerCard, same one Roll Comparison uses */}
      {roster.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {roster.map((m) => (
            <div key={m.id} className="w-48">
              <PlayerCard member={m} compact />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Stage — the reveal, vertically centered to fill the viewport */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {activeSlot && (
          <div className="w-full space-y-6 text-center animate-fade-in">
            <div>
              <p className="section-label text-bungie-blue">
                Slot {doneCount + 1} of 3
              </p>
              <h2 className="mt-1 text-3xl font-black uppercase tracking-tight text-white">
                {SLOT_LABELS[activeSlot]}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {activeOptions.length === 0
                  ? isCaptain
                    ? poolReady
                      ? "Spin up three candidates and pick one for the fireteam."
                      : "Loading the fireteam's shared weapon pool…"
                    : `Waiting for ${nameFor(lobby.captain_user_id)} to spin the ${SLOT_LABELS[activeSlot]} slot…`
                  : isSolo
                    ? isCaptain
                      ? "Tap the weapon to lock it in."
                      : `${nameFor(lobby.captain_user_id)} is choosing…`
                    : isSpectator
                      ? "Watching the fireteam vote…"
                      : myVote != null
                        ? "Vote cast. Tap another to change it."
                        : "Tap a weapon to vote."}
              </p>
              {!isSolo && activeOptions.length > 0 && secondsLeft !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  {activeVotes.length}/{nonSpectatorMembers.length} voted · auto-picks in {secondsLeft}s
                </p>
              )}
            </div>

            {activeOptions.length === 0 ? (
              <>
                <div className="w-full overflow-x-auto pb-2">
                  <div className="flex min-w-max justify-center gap-4">
                    {[0, 1, 2].map((i) => (
                      <CardBack key={i} pulse={isCaptain} />
                    ))}
                  </div>
                </div>
                {isCaptain && (
                  <button
                    type="button"
                    onClick={() => reveal(activeSlot)}
                    disabled={busy || !poolReady}
                    className="mx-auto flex items-center gap-2 bg-bungie-blue px-8 py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#26bcf3] disabled:opacity-50"
                  >
                    {!poolReady && <Spinner size={14} />}
                    {busy ? "Spinning…" : !poolReady ? "Loading weapon pool…" : `Reveal ${SLOT_LABELS[activeSlot]}`}
                  </button>
                )}
              </>
            ) : (
              <div className="w-full overflow-x-auto pb-2">
                <div className="flex min-w-max justify-center gap-4">
                  {activeOptions.map((opt, i) => (
                  <DraftCard
                    key={`${activeSlot}-${opt.itemHash}`}
                    option={opt}
                    fillers={fillerIcons}
                    spin={shouldSpin}
                    delay={i * 220}
                    disabled={isSolo ? busy || !isCaptain : isSpectator}
                    selected={isSolo ? pickingHash === opt.itemHash : myVote === opt.itemHash}
                    dimmed={isSolo && pickingHash !== null && pickingHash !== opt.itemHash}
                    voteCount={isSolo ? undefined : voteCounts[opt.itemHash]}
                    onPick={() => {
                      if (isSolo) {
                        if (isCaptain) pick(activeSlot, opt.itemHash);
                      } else {
                        vote(activeSlot, opt.itemHash);
                      }
                    }}
                  />
                  ))}
                </div>
                {isCaptain && (
                  <button
                    type="button"
                    onClick={() => reveal(activeSlot)}
                    disabled={busy}
                    className="mx-auto mt-4 border border-bungie-border px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-300 hover:border-bungie-blue hover:text-bungie-blue disabled:opacity-50"
                  >
                    {busy ? "Rerolling..." : "Reroll options"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {showRollPicker && (
          <div className="w-full max-w-md space-y-5 text-center animate-fade-in">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                Choose Your Roll
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Pick which copy to equip for weapons you own more than one of.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Auto-selecting in {rollSecondsLeft}s
              </p>
            </div>
            <div className="space-y-4 text-left">
              {multiRollSlots.map((slot) => {
                const rd = rollsData[slot]!;
                const mine = rd.members.find((m) => m.isMe)?.instances ?? [];
                const chosen = myChosenInstances[slot];
                return (
                  <div key={slot} className="border border-bungie-border/50 bg-bungie-surface">
                    <p className="text-gray-400 text-[10px] uppercase tracking-wide px-3 pt-2">
                      {SLOT_LABELS[slot]} · {rd.weaponName}
                    </p>
                    <div className="py-1">
                      {mine.map((inst) => (
                        <RollRow
                          key={inst.instanceId}
                          label={inst.perks.map((p) => p.name).join("  ·  ")}
                          location={inst.location}
                          selected={chosen === inst.instanceId}
                          onClick={() => chooseRoll(slot, inst.instanceId)}
                          favorited={favorites[rd.itemHash.toString()] === inst.instanceId}
                          onToggleFavorite={() => toggleFavorite(slot, rd.itemHash, inst.instanceId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={finishRollPicker}
              className="bg-bungie-blue px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#26bcf3]"
            >
              Continue
            </button>
          </div>
        )}

        {complete && !showRollPicker && (
          <div className="w-full max-w-md space-y-5 text-center animate-fade-in">
            <div>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-bungie-blue text-bungie-blue">
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 12.5L9 17.5L20 6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="square"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                Loadout Locked
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Equip it on a character to send it in-game.
              </p>
            </div>
            {charactersLoading && <p className="text-sm text-gray-400">Loading Destiny characters...</p>}
            {characterError && (
              <div className="space-y-3 border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                <p>{characterError}</p>
                <button type="button" onClick={retryCharacters} className="border border-red-400/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-200 hover:bg-red-500/10">
                  Retry
                </button>
              </div>
            )}
            {characters.length > 0 && (
              <div className="flex items-center justify-center gap-2">
                <select
                  value={selectedCharacterId}
                  onChange={(e) => setSelectedCharacterId(e.target.value)}
                  className="border border-bungie-border bg-bungie-dark px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white"
                >
                  {characters.map((c) => (
                    <option key={c.characterId} value={c.characterId}>
                      {CLASS_LABELS[c.classType] ?? "Guardian"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyLoadout}
                  disabled={busy || !selectedCharacterId}
                  className="bg-bungie-blue px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#26bcf3] disabled:opacity-50"
                >
                  {busy ? "Applying…" : "Apply Loadout"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fireteam loadout tray — fills in as slots are locked */}
      <div>
        <p className="section-label mb-2">Fireteam Loadout</p>
        <div className="grid grid-cols-3 gap-3">
          {SLOT_ORDER.map((slot) => {
            const committed = slots.find((s) => s.slot === slot);
            const color = committed ? damageColor(committed.damage_type) : undefined;
            return (
              <div
                key={slot}
                className={`flex items-center gap-3 border bg-bungie-surface p-3 transition-colors ${
                  committed
                    ? "border-bungie-border animate-slot-land"
                    : slot === activeSlot
                      ? "border-white/25"
                      : "border-bungie-border/50"
                }`}
              >
                <div
                  className="relative h-11 w-11 shrink-0 overflow-hidden bg-bungie-dark"
                  style={committed ? { boxShadow: `0 0 0 1px ${color}77` } : undefined}
                >
                  {committed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={committed.weapon_icon}
                      alt={committed.weapon_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-700">
                      -
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {SLOT_LABELS[slot]}
                  </div>
                  <div className="truncate text-xs font-bold text-white">
                    {committed ? committed.weapon_name : "Not picked"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
