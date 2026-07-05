import { act, renderHook, waitFor } from "@testing-library/react";
import { useLobbySession } from "@/hooks/lobby/useLobbySession";
import type { Lobby, LobbyLoadoutSlot, LobbyMember } from "@/types/lobby";

type Handler = (payload: any) => void;

class ChannelStub {
  handlers: Array<{ type: string; filter: Record<string, unknown>; handler: Handler }> = [];
  send = jest.fn();
  on(type: string, filter: Record<string, unknown>, handler: Handler) {
    this.handlers.push({ type, filter, handler });
    return this;
  }
  fire(type: string, tableOrEvent: string, payload: Record<string, unknown>) {
    const eventType = (payload.eventType as string | undefined) ?? "UPDATE";
    for (const h of this.handlers) {
      if (h.type !== type) continue;
      if (type === "broadcast" && h.filter.event === tableOrEvent) h.handler(payload);
      if (
        type === "postgres_changes" &&
        h.filter.table === tableOrEvent &&
        (h.filter.event === "*" || h.filter.event === eventType)
      ) {
        h.handler(payload);
      }
    }
  }
}

const channel = new ChannelStub();
let roundData: { id: string } | null = { id: "round-1" };
let slotsData: LobbyLoadoutSlot[] | null = [];

function query(table: string) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.single = jest.fn(() => Promise.resolve({ data: table === "lobby_rounds" ? roundData : null }));
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: table === "lobby_loadout_slots" ? slotsData : null }).then(resolve);
  return chain;
}

const supabase = { from: jest.fn((table: string) => query(table)) };

jest.mock("@/hooks/useSupabaseChannel", () => ({
  useSupabaseChannel: jest.fn((_name: string, configure: (channel: ChannelStub) => void) => {
    if (channel.handlers.length === 0) configure(channel);
    return { channelRef: { current: channel }, supabase };
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ createClient: jest.fn() }));

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    id: "lobby-1",
    code: "ABC123",
    host_user_id: "u-host",
    captain_user_id: "u-1",
    status: "waiting",
    current_round: 1,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function member(overrides: Partial<LobbyMember> = {}): LobbyMember {
  return {
    id: "m-1",
    lobby_id: "lobby-1",
    user_id: "u-1",
    display_name: "Alice",
    bungie_membership_type: 1,
    bungie_membership_id: "b-1",
    selected_character_id: "c-1",
    emblem_path: null,
    emblem_background_path: null,
    clan_name: null,
    clan_tag: null,
    is_ready: true,
    is_captain: true,
    is_spectator: false,
    joined_at: "2026-01-01",
    ...overrides,
  };
}

function loadout(overrides: Partial<LobbyLoadoutSlot> = {}): LobbyLoadoutSlot {
  return {
    id: "s-1",
    round_id: "round-1",
    slot: "kinetic",
    item_hash: 100,
    weapon_name: "Weapon",
    weapon_icon: "",
    weapon_type: "Rifle",
    damage_type: "Kinetic",
    locked_by_user_id: "u-1",
    created_at: "2026-01-01",
    ...overrides,
  };
}

function renderSession(callbacks: Record<string, jest.Mock> = {}) {
  return renderHook(
    ({ callbacks }) => useLobbySession(lobby(), [member(), member({ id: "m-2", user_id: "u-2", is_captain: false, is_spectator: true })], "u-1", callbacks),
    { initialProps: { callbacks } }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  channel.handlers = [];
  channel.send.mockClear();
  roundData = { id: "round-1" };
  slotsData = [];
});

describe("useLobbySession", () => {
  it("updates lobby data from lobbies UPDATE events", async () => {
    const { result } = renderSession();
    act(() => channel.fire("postgres_changes", "lobbies", { new: lobby({ status: "in_game" }) }));
    expect(result.current.lobbyData.status).toBe("in_game");
  });

  it("upserts, updates, and removes lobby members", () => {
    const { result } = renderSession();
    act(() => channel.fire("postgres_changes", "lobby_members", { eventType: "INSERT", new: member({ id: "m-3", user_id: "u-3", display_name: "Cara", is_captain: false }) }));
    expect(result.current.members.map((m) => m.id)).toContain("m-3");

    act(() => channel.fire("postgres_changes", "lobby_members", { eventType: "UPDATE", new: member({ id: "m-3", user_id: "u-3", display_name: "Caroline", is_captain: false }) }));
    expect(result.current.members.find((m) => m.id === "m-3")?.display_name).toBe("Caroline");

    act(() => channel.fire("postgres_changes", "lobby_members", { eventType: "DELETE", old: { id: "m-3" } }));
    expect(result.current.members.map((m) => m.id)).not.toContain("m-3");
  });

  it("drops slot events for stale rounds", async () => {
    const onSlotRolled = jest.fn();
    const { result } = renderSession({ onSlotRolled });
    await waitFor(() => expect(result.current.roundId).toBe("round-1"));

    act(() => channel.fire("postgres_changes", "lobby_loadout_slots", { eventType: "INSERT", new: loadout({ round_id: "old-round" }) }));

    expect(result.current.slots).toEqual([]);
    expect(onSlotRolled).not.toHaveBeenCalled();
  });

  it("loads rounds, preserves slots on query error, and fires load callbacks for non-zero slots", async () => {
    slotsData = [loadout({ item_hash: 100 }), loadout({ id: "s-2", slot: "energy", item_hash: 0 })];
    const onRoundLoaded = jest.fn();
    const onSlotRolled = jest.fn();
    const { result, rerender } = renderSession({ onRoundLoaded, onSlotRolled });

    await waitFor(() => expect(result.current.slots).toHaveLength(2));
    expect(onRoundLoaded).toHaveBeenCalledWith(slotsData);
    expect(onSlotRolled).toHaveBeenCalledWith("kinetic", 100);

    slotsData = null;
    act(() => channel.fire("postgres_changes", "lobbies", { new: lobby({ current_round: 2 }) }));
    rerender({ callbacks: { onRoundLoaded, onSlotRolled } });

    await waitFor(() => expect(result.current.roundId).toBe("round-1"));
    expect(result.current.slots).toHaveLength(2);
  });

  it("fires round advance only for non-null to different non-null round changes and clears slots", async () => {
    slotsData = [loadout()];
    const onRoundAdvance = jest.fn();
    const { result, rerender } = renderSession({ onRoundAdvance });
    await waitFor(() => expect(result.current.roundId).toBe("round-1"));
    expect(onRoundAdvance).not.toHaveBeenCalled();

    roundData = { id: "round-2" };
    slotsData = [loadout({ id: "s-2", round_id: "round-2" })];
    act(() => channel.fire("postgres_changes", "lobbies", { new: lobby({ current_round: 2 }) }));
    rerender({ callbacks: { onRoundAdvance } });

    await waitFor(() => expect(onRoundAdvance).toHaveBeenCalledTimes(1));
    expect(result.current.slots).toEqual([]);
  });

  it("seeds slots only while no real weapon has landed", async () => {
    const { result } = renderSession();
    await waitFor(() => expect(result.current.roundId).toBe("round-1"));

    act(() => result.current.seedSlots([loadout({ item_hash: 0 })]));
    expect(result.current.slots).toHaveLength(1);
    act(() => result.current.seedSlots([loadout({ id: "s-real", slot: "energy", item_hash: 200 })]));
    expect(result.current.slots).toHaveLength(2);
    act(() => result.current.seedSlots([loadout({ id: "s-new", slot: "power", item_hash: 300 })]));
    expect(result.current.slots.map((s) => s.slot)).not.toContain("power");
  });

  it("sends and receives captain apply broadcasts", () => {
    const onCaptainApply = jest.fn();
    const { result } = renderSession({ onCaptainApply });

    act(() => result.current.sendCaptainApply());
    expect(channel.send).toHaveBeenCalledWith({ type: "broadcast", event: "captain_apply", payload: {} });

    act(() => channel.fire("broadcast", "captain_apply", {}));
    expect(onCaptainApply).toHaveBeenCalledTimes(1);
  });

  it("derives captain, spectator, and host flags", () => {
    const host = renderHook(() => useLobbySession(lobby({ host_user_id: "u-2" }), [member({ is_captain: false }), member({ id: "m-2", user_id: "u-2", is_captain: false, is_spectator: true })], "u-2", {}));
    expect(host.result.current.isCaptain).toBe(false);
    expect(host.result.current.isSpectator).toBe(true);
    expect(host.result.current.isHost).toBe(true);
  });

  it("uses fresh callbacks after rerender for channel events", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderSession({ onCaptainApply: first });

    rerender({ callbacks: { onCaptainApply: second } });
    act(() => channel.fire("broadcast", "captain_apply", {}));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
