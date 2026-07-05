import { act, renderHook, waitFor } from "@testing-library/react";
import { useRollState } from "@/hooks/lobby/useRollState";
import type { Lobby } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

const fetchMock = jest.fn();

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    id: "lobby-1",
    code: "ABC123",
    host_user_id: "u-host",
    captain_user_id: "u-captain",
    status: "waiting",
    current_round: 1,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function latestBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("useRollState", () => {
  it("seeds initial state from lobby roll settings and falls back when absent", () => {
    const seeded = renderHook(() =>
      useRollState(
        lobby({
          roll_settings: {
            mode: "chaos",
            noDup: true,
            banned: ["Pulse Rifle"],
            rerollLimit: 2,
            slots: { kinetic: "normal", energy: "lock", power: "wildcard" },
          },
        }),
        false,
        1
      )
    );
    expect(seeded.result.current.rollMode).toBe("chaos");
    expect(seeded.result.current.noDupMode).toBe(true);
    expect([...seeded.result.current.bannedTypes]).toEqual(["Pulse Rifle"]);
    expect(seeded.result.current.rerollLimit).toBe(2);

    const fallback = renderHook(() => useRollState(lobby(), false, 1));
    expect(fallback.result.current.rollMode).toBe("normal");
    expect(fallback.result.current.noDupMode).toBe(false);
    expect([...fallback.result.current.bannedTypes]).toEqual([]);
    expect(fallback.result.current.rerollLimit).toBeNull();
  });

  it("initializes wildcard slots to power", () => {
    const { result } = renderHook(() => useRollState(lobby(), false, 1));
    expect([...result.current.wildcardSlots]).toEqual(["power"]);
  });

  it("records recent rolls most-recent first without duplicating", () => {
    const { result } = renderHook(() => useRollState(lobby(), false, 1));

    act(() => {
      result.current.recordRoll("kinetic", 100);
      result.current.recordRoll("kinetic", 100);
      result.current.recordRoll("kinetic", 200);
      result.current.recordRoll("kinetic", 100);
    });

    expect(result.current.recentRollsRef.current.kinetic).toEqual([100, 200]);
  });

  it("resets rerolls used when the current round changes", () => {
    const { result, rerender } = renderHook(
      ({ round }) => useRollState(lobby(), false, round),
      { initialProps: { round: 1 } }
    );
    act(() => {
      result.current.noteRerollUsed();
      result.current.noteRerollUsed();
    });
    expect(result.current.rerollsUsed).toBe(2);

    act(() => rerender({ round: 2 }));

    expect(result.current.rerollsUsed).toBe(0);
  });

  it("tracks reroll exhaustion and increments rerolls used", () => {
    const { result } = renderHook(() =>
      useRollState(lobby({ roll_settings: { mode: "normal", noDup: false, banned: [], rerollLimit: 1, slots: { kinetic: "normal", energy: "normal", power: "wildcard" } } }), false, 1)
    );
    expect(result.current.rerollExhausted).toBe(false);

    act(() => result.current.noteRerollUsed());

    expect(result.current.rerollsUsed).toBe(1);
    expect(result.current.rerollExhausted).toBe(true);
  });

  it("resets per-slot modes for a new round", () => {
    const { result } = renderHook(() => useRollState(lobby(), false, 1));
    act(() => {
      result.current.setLockedSlots(new Set<WeaponSlot>(["kinetic"]));
      result.current.setWildcardSlots(new Set<WeaponSlot>(["energy"]));
    });

    act(() => result.current.resetForNewRound());

    expect([...result.current.lockedSlots]).toEqual([]);
    expect([...result.current.wildcardSlots]).toEqual(["power"]);
  });

  it("publishes settings only for captains", () => {
    const { result } = renderHook(() => useRollState(lobby(), false, 1));
    act(() => result.current.setRollMode("meta"));
    act(() => jest.advanceTimersByTime(401));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounces captain settings publishes into one request with final state", async () => {
    const { result } = renderHook(() => useRollState(lobby(), true, 1));
    fetchMock.mockClear();

    act(() => {
      result.current.setRollMode("chaos");
      result.current.setNoDupMode(true);
      jest.advanceTimersByTime(399);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(latestBody().settings).toMatchObject({ mode: "chaos", noDup: true });
  });

  it("publishes locked, wildcard, and normal slot modes", async () => {
    const { result } = renderHook(() => useRollState(lobby(), true, 1));
    fetchMock.mockClear();

    act(() => {
      result.current.setLockedSlots(new Set<WeaponSlot>(["kinetic"]));
      result.current.setWildcardSlots(new Set<WeaponSlot>(["energy"]));
    });
    act(() => jest.advanceTimersByTime(400));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(latestBody().settings.slots).toEqual({
      kinetic: "lock",
      energy: "wildcard",
      power: "normal",
    });
  });
});
