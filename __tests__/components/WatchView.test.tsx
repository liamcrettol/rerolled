/**
 * Characterization tests for the spectator WatchView (#223).
 *
 * Covers the realtime channel lifecycle (subscribe on mount, removeChannel on
 * unmount) and how postgres_changes payloads drive the DOM: lobby status/round
 * updates, slot rolls landing, wildcard rendering, and member join/leave.
 * The Supabase client is mocked with a channel stub that captures handlers so
 * tests can fire payloads directly.
 */
import { render, screen, act, waitFor } from "@testing-library/react";
import WatchView from "@/app/watch/[code]/WatchView";
import { createClient } from "@/lib/supabase/client";
import type { LobbyLoadoutSlot } from "@/types/lobby";

type Handler = (payload: unknown) => void;

// Captures .on(...) registrations keyed by table (postgres) or event (broadcast).
class ChannelStub {
  handlers: Array<{ filter: Record<string, unknown>; handler: Handler }> = [];
  subscribed = false;

  on(_type: string, filter: Record<string, unknown>, handler: Handler) {
    this.handlers.push({ filter, handler });
    return this;
  }
  subscribe() {
    this.subscribed = true;
    return this;
  }
  /**
   * Fire the handlers registered for a table, honoring the event filter the
   * component registered with ("*" receives everything, like Supabase).
   */
  fire(table: string, payload: Record<string, unknown>) {
    const eventType = (payload.eventType as string) ?? "UPDATE";
    for (const { filter, handler } of this.handlers) {
      if (filter.table !== table) continue;
      if (filter.event === "*" || filter.event === eventType) handler(payload);
    }
  }
}

const channels: ChannelStub[] = [];
const removeChannel = jest.fn();

// Chainable query stub for the loadRound() queries inside the lobby UPDATE
// handler; resolves empty so tests drive slots purely via realtime payloads.
function queryStub() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => Promise.resolve({ data: null }));
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [] }).then(resolve);
  return chain;
}

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(() => ({
    channel: jest.fn((_name: string) => {
      const stub = new ChannelStub();
      channels.push(stub);
      return stub;
    }),
    from: jest.fn(() => queryStub()),
    removeChannel,
  })),
}));

function makeSlot(overrides: Partial<LobbyLoadoutSlot>): LobbyLoadoutSlot {
  return {
    id: "s-1",
    round_id: "round-1",
    slot: "kinetic",
    item_hash: 100,
    weapon_name: "The Messenger",
    weapon_icon: "https://bungie.net/icon.png",
    weapon_type: "Pulse Rifle",
    damage_type: "Kinetic",
    locked_by_user_id: "u-1",
    created_at: "2026-01-01",
    ...overrides,
  };
}

function renderWatchView(overrides: Partial<Parameters<typeof WatchView>[0]> = {}) {
  return render(
    <WatchView
      lobbyId="lobby-1"
      code="ABC123"
      initialRoundNumber={1}
      initialRoundId="round-1"
      initialSlots={[]}
      initialMembers={[
        { id: "m-1", userId: "u-1", displayName: "Alice#123", isCaptain: true, hasCharacter: true },
      ]}
      initialStatus="waiting"
      initialLastGame={null}
      initialLobbyLeaderboard={[]}
      {...overrides}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  channels.length = 0;
});

describe("WatchView — channel lifecycle", () => {
  it("subscribes exactly one channel on mount and removes it on unmount", () => {
    const { unmount } = renderWatchView();
    expect(channels).toHaveLength(1);
    expect(channels[0].subscribed).toBe(true);

    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("registers handlers for lobbies, loadout slots, members, and game sessions", () => {
    renderWatchView();
    const tables = channels[0].handlers.map((h) => h.filter.table);
    expect(tables).toEqual(
      expect.arrayContaining(["lobbies", "lobby_loadout_slots", "lobby_members", "game_sessions"])
    );
  });
});

describe("WatchView — realtime payloads drive the view", () => {
  it("renders a rolled weapon when its slot INSERT arrives for the current round", () => {
    renderWatchView();
    expect(screen.getAllByText("Not rolled yet")).toHaveLength(3); // all slots empty

    act(() => {
      channels[0].fire("lobby_loadout_slots", {
        eventType: "INSERT",
        new: makeSlot({}),
      });
    });

    expect(screen.getByText("The Messenger")).toBeInTheDocument();
    expect(screen.getAllByText("Not rolled yet")).toHaveLength(2); // kinetic filled
  });

  it("ignores slot payloads from a different round", () => {
    renderWatchView();
    act(() => {
      channels[0].fire("lobby_loadout_slots", {
        eventType: "INSERT",
        new: makeSlot({ round_id: "round-STALE" }),
      });
    });
    expect(screen.queryByText("The Messenger")).not.toBeInTheDocument();
  });

  it("renders the wildcard state for item_hash 0", () => {
    renderWatchView();
    act(() => {
      channels[0].fire("lobby_loadout_slots", {
        eventType: "INSERT",
        new: makeSlot({ item_hash: 0, weapon_name: "?", weapon_icon: "" }),
      });
    });
    expect(screen.getByText("Player's own")).toBeInTheDocument();
  });

  it("updates round number and status badge on a lobby UPDATE", async () => {
    renderWatchView();
    expect(screen.getByText(/Round 1/)).toBeInTheDocument();

    act(() => {
      channels[0].fire("lobbies", {
        new: { id: "lobby-1", current_round: 3, status: "in_game" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Round 3/)).toBeInTheDocument();
      expect(screen.getByText(/In game/)).toBeInTheDocument();
    });
  });

  it("adds and removes fireteam members on INSERT/DELETE", () => {
    renderWatchView();
    expect(screen.getByText(/Fireteam \(1\)/)).toBeInTheDocument();

    act(() => {
      channels[0].fire("lobby_members", {
        eventType: "INSERT",
        new: {
          id: "m-2",
          user_id: "u-2",
          display_name: "Bob#456",
          is_captain: false,
          selected_character_id: null,
        },
        old: {},
      });
    });
    expect(screen.getByText(/Fireteam \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument(); // #456 suffix trimmed for display

    act(() => {
      channels[0].fire("lobby_members", { eventType: "DELETE", new: {}, old: { id: "m-2" } });
    });
    expect(screen.getByText(/Fireteam \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});
