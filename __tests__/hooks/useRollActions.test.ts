import { useRef, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRollActions } from "@/hooks/lobby/useRollActions";
import type { LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

const fetchMock = jest.fn();
const noteRerollUsed = jest.fn();
const dismissLastGame = jest.fn();
const onConfirmSpecial = jest.fn();

function slot(slotName: WeaponSlot, item_hash: number): LobbyLoadoutSlot {
  return {
    id: `${slotName}-slot`,
    round_id: "round-1",
    slot: slotName,
    item_hash,
    weapon_name: `${slotName} weapon`,
    weapon_icon: "",
    weapon_type: "Rifle",
    damage_type: "Kinetic",
    locked_by_user_id: "u-1",
    created_at: "2026-01-01",
  };
}

const weaponDetails = {
  "100": { name: "Kinetic Exotic", icon: "", weaponType: "Hand Cannon", damageType: "Kinetic", tierType: 6, tierName: "Exotic", ammoType: "Primary", stats: {} },
  "200": { name: "Energy Exotic", icon: "", weaponType: "Scout Rifle", damageType: "Arc", tierType: 6, tierName: "Exotic", ammoType: "Primary", stats: {} },
  "300": { name: "Power", icon: "", weaponType: "Rocket", damageType: "Solar", tierType: 5, tierName: "Legendary", ammoType: "Heavy", stats: {} },
  "400": { name: "Kinetic Special", icon: "", weaponType: "Shotgun", damageType: "Kinetic", tierType: 5, tierName: "Legendary", ammoType: "Special", stats: {} },
  "500": { name: "Energy Special", icon: "", weaponType: "Fusion Rifle", damageType: "Arc", tierType: 5, tierName: "Legendary", ammoType: "Special", stats: {} },
};

function renderActions(overrides: Record<string, unknown> = {}) {
  const pick = <T,>(key: string, fallback: T): T =>
    Object.prototype.hasOwnProperty.call(overrides, key) ? (overrides[key] as T) : fallback;
  return renderHook(() => {
    const [lockedSlots, setLockedSlots] = useState<Set<WeaponSlot>>(new Set(overrides.lockedSlots as WeaponSlot[] | undefined));
    const [wildcardSlots, setWildcardSlots] = useState<Set<WeaponSlot>>(new Set(overrides.wildcardSlots as WeaponSlot[] | undefined));
    const [preferredInstances, setPreferredInstances] = useState<Partial<Record<WeaponSlot, string>>>({ kinetic: "pref-k", energy: "pref-e" });
    const recentRollsRef = useRef<Record<WeaponSlot, number[]>>((overrides.recentRolls as Record<WeaponSlot, number[]>) ?? { kinetic: [111], energy: [222], power: [333] });
    const animKindRef = useRef<Record<string, "roll" | "pick">>({});
    const actions = useRollActions({
      lobbyId: "lobby-1",
      roundId: pick<string | null>("roundId", "round-1"),
      slots: pick<LobbyLoadoutSlot[]>("slots", [slot("kinetic", 100), slot("energy", 200), slot("power", 0)]),
      intersection: pick<Record<WeaponSlot, number[]> | null>("intersection", { kinetic: [100, 400], energy: [200, 500], power: [300] }),
      effectiveIntersection: pick<Record<WeaponSlot, number[]> | null>("effectiveIntersection", { kinetic: [400], energy: [500], power: [300] }),
      weaponDetails,
      rollMode: (overrides.rollMode as "normal" | "chaos" | "meta" | undefined) ?? "chaos",
      noDupMode: (overrides.noDupMode as boolean | undefined) ?? true,
      rerollExhausted: (overrides.rerollExhausted as boolean | undefined) ?? false,
      noteRerollUsed,
      lockedSlots,
      setLockedSlots,
      wildcardSlots,
      setWildcardSlots,
      recentRollsRef,
      animKindRef,
      setPreferredInstances,
      dismissLastGame,
      onConfirmSpecial,
    });
    return { ...actions, lockedSlots, wildcardSlots, preferredInstances, recentRollsRef, animKindRef };
  });
}

function lastBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = fetchMock;
});

describe("useRollActions", () => {
  it("roll all keeps only locked real slots and no-ops when exhausted or missing prerequisites", async () => {
    const { result } = renderActions({ lockedSlots: ["kinetic"], wildcardSlots: ["power"] });
    await act(async () => result.current.handleRoll());

    expect(lastBody()).toMatchObject({
      keepSlots: { kinetic: 100 },
      wildcardSlots: ["power"],
      avoid: { kinetic: [111], energy: [222], power: [333] },
      mode: "chaos",
      nodup: true,
    });
    expect(noteRerollUsed).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const exhausted = renderActions({ rerollExhausted: true });
    await act(async () => exhausted.result.current.handleRoll());
    const noRound = renderActions({ roundId: null });
    await act(async () => noRound.result.current.handleRoll());
    const noIntersection = renderActions({ intersection: null });
    await act(async () => noIntersection.result.current.handleRoll());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("single-slot reroll keeps every other real non-wildcard slot", async () => {
    const { result } = renderActions({ slots: [slot("kinetic", 100), slot("energy", 200), slot("power", 300)], wildcardSlots: ["power"] });

    await act(async () => result.current.handleRoll("energy"));

    expect(lastBody().rerollSlot).toBe("energy");
    expect(lastBody().keepSlots).toEqual({ kinetic: 100 });
  });

  it("cycles slot modes through locked, wildcard, and random with restore or reroll", async () => {
    const { result } = renderActions({ recentRolls: { kinetic: [999], energy: [], power: [] } });

    act(() => result.current.cycleSlotMode("kinetic"));
    expect([...result.current.lockedSlots]).toEqual(["kinetic"]);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => result.current.cycleSlotMode("kinetic"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect([...result.current.lockedSlots]).toEqual([]);
    expect([...result.current.wildcardSlots]).toEqual(["kinetic"]);
    expect(lastBody().wildcardSlots).toEqual(["kinetic"]);

    const restore = renderActions({
      wildcardSlots: ["kinetic"],
      slots: [slot("kinetic", 0), slot("energy", 200), slot("power", 300)],
      recentRolls: { kinetic: [999], energy: [], power: [] },
    });
    await act(async () => restore.result.current.cycleSlotMode("kinetic"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastBody().keepSlots.kinetic).toBe(999);

    const noRecent = renderActions({ wildcardSlots: ["energy"], recentRolls: { kinetic: [], energy: [], power: [] } });
    await act(async () => noRecent.result.current.cycleSlotMode("energy"));
    expect(lastBody().keepSlots).not.toHaveProperty("energy");
  });

  it("selecting an exotic releases other exotic slots and their preferred instances", async () => {
    const { result } = renderActions({ slots: [slot("kinetic", 100), slot("energy", 200), slot("power", 300)] });

    await act(async () => result.current.commitWeaponSelect("kinetic", 100, "new-k"));

    expect(lastBody().keepSlots).toEqual({ kinetic: 100, power: 300 });
    expect(result.current.preferredInstances).toEqual({ kinetic: "new-k" });
  });

  it("gates double-special selections but skips the gate when the slot hash is unchanged", async () => {
    const specialSlots = [slot("kinetic", 400), slot("energy", 500), slot("power", 300)];
    const { result } = renderActions({ slots: specialSlots });

    act(() => result.current.handleSelectWeapon("kinetic", 400, "same"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onConfirmSpecial).not.toHaveBeenCalled();

    act(() => result.current.handleSelectWeapon("kinetic", 500, "new-special"));
    expect(onConfirmSpecial).toHaveBeenCalledWith({
      slot: "kinetic",
      hash: 500,
      instanceId: "new-special",
      otherName: "Energy Special",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses roll mode, nodup, and avoid data on roll request paths", async () => {
    const { result } = renderActions({ rollMode: "meta", noDupMode: false });

    await act(async () => result.current.rollWithModes(new Set<WeaponSlot>(["power"])));

    expect(lastBody()).toMatchObject({
      avoid: { kinetic: [111], energy: [222], power: [333] },
      mode: "meta",
    });
    expect(lastBody().nodup).toBeUndefined();
  });

  it("sets rolling true synchronously and false after fetch resolves", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = renderActions();

    act(() => { void result.current.handleRoll(); });
    expect(result.current.rolling).toBe(true);
    await act(async () => resolve({ ok: true, json: async () => ({}) }));

    await waitFor(() => expect(result.current.rolling).toBe(false));
  });
});
