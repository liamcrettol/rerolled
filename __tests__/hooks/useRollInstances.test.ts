import { act, renderHook, waitFor } from "@testing-library/react";
import { useRollInstances } from "@/hooks/lobby/useRollInstances";
import type { LobbyLoadoutSlot } from "@/types/lobby";

const fetchMock = jest.fn();

function slot(slotName: "kinetic" | "energy" | "power", item_hash: number): LobbyLoadoutSlot {
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

function member(instances: Array<{ instanceId: string; location: string }>) {
  return [{ isMe: true, instances }];
}

function rollsResponse() {
  return {
    slots: {
      kinetic: { itemHash: 100, members: member([{ instanceId: "fav-100", location: "vault" }, { instanceId: "char-100", location: "character" }]) },
      energy: { itemHash: 200, members: member([{ instanceId: "kept-200", location: "vault" }, { instanceId: "char-200", location: "character" }]) },
      power: { itemHash: 300, members: member([{ instanceId: "first-300", location: "vault" }, { instanceId: "second-300", location: "vault" }]) },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => rollsResponse() });
  global.fetch = fetchMock;
});

describe("useRollInstances", () => {
  it("loads favorites from localStorage and persists changes", async () => {
    localStorage.setItem("gr_fav_rolls", JSON.stringify({ "100": "fav-100" }));
    const { result } = renderHook(() => useRollInstances("lobby-1", null, []));

    await waitFor(() => expect(result.current.favorites).toEqual({ "100": "fav-100" }));
    act(() => result.current.toggleFavorite("kinetic", 200, "fav-200"));

    expect(result.current.favorites).toEqual({ "100": "fav-100", "200": "fav-200" });
    expect(localStorage.getItem("gr_fav_rolls")).toBe(JSON.stringify({ "100": "fav-100", "200": "fav-200" }));
  });

  it("toggles favorites and immediately selects the favorited instance", () => {
    const { result } = renderHook(() => useRollInstances("lobby-1", null, []));

    act(() => result.current.toggleFavorite("kinetic", 100, "i-1"));
    expect(result.current.favorites).toEqual({ "100": "i-1" });
    expect(result.current.myChosenInstances.kinetic).toBe("i-1");

    act(() => result.current.toggleFavorite("kinetic", 100, "i-1"));
    expect(result.current.favorites).toEqual({});
    expect(result.current.myChosenInstances.kinetic).toBe("i-1");
  });

  it("selects favorited, still-valid, character, then first owned instances by priority", async () => {
    localStorage.setItem("gr_fav_rolls", JSON.stringify({ "100": "fav-100" }));
    const { result } = renderHook(() =>
      useRollInstances("lobby-1", "round-1", [slot("kinetic", 100), slot("energy", 200), slot("power", 300)])
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.handleChooseInstance("energy", "kept-200"));
    await act(async () => result.current.fetchRolls());

    expect(result.current.myChosenInstances).toEqual({
      kinetic: "fav-100",
      energy: "kept-200",
      power: "first-300",
    });
  });

  it("sets rollsError on non-ok responses and stops loading", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "No rolls" }) });
    const { result } = renderHook(() => useRollInstances("lobby-1", "round-1", []));

    await act(async () => result.current.fetchRolls());

    expect(result.current.rollsError).toBe("No rolls");
    expect(result.current.rollsLoading).toBe(false);
  });

  it("fetches only when roundId and a non-zero slot exist, otherwise clears rolls data", async () => {
    const { result, rerender } = renderHook(
      ({ roundId, slots }) => useRollInstances("lobby-1", roundId, slots),
      { initialProps: { roundId: null as string | null, slots: [slot("kinetic", 100)] } }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.rollsData).toEqual({});

    rerender({ roundId: "round-1", slots: [slot("kinetic", 0)] });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ roundId: "round-1", slots: [slot("kinetic", 100)] });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("keys refetches by per-slot hashes, not unrelated prop identity", async () => {
    const initial = [slot("kinetic", 100), slot("energy", 200)];
    const { rerender } = renderHook(
      ({ slots }) => useRollInstances("lobby-1", "round-1", slots),
      { initialProps: { slots: initial } }
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ slots: [slot("kinetic", 100), slot("energy", 200)] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ slots: [slot("kinetic", 101), slot("energy", 200)] });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("chooses an instance without touching favorites", () => {
    const { result } = renderHook(() => useRollInstances("lobby-1", null, []));

    act(() => result.current.handleChooseInstance("power", "manual-1"));

    expect(result.current.myChosenInstances.power).toBe("manual-1");
    expect(result.current.favorites).toEqual({});
  });
});
