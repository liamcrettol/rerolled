import { act, renderHook, waitFor } from "@testing-library/react";
import { useGameDetection, POLL_INTERVAL_MS } from "@/hooks/useGameDetection";

type Handler = () => void;

class ChannelStub {
  handlers: Handler[] = [];
  subscribe = jest.fn(() => this);
  on = jest.fn((_type: string, _filter: Record<string, unknown>, handler: Handler) => {
    this.handlers.push(handler);
    return this;
  });
  fireInsert() {
    for (const h of this.handlers) h();
  }
}

const channel = new ChannelStub();
const removeChannel = jest.fn();
const fetchMock = jest.fn();
const onSwitchToHistoryTab = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(() => ({ channel: jest.fn(() => channel), removeChannel })),
}));

function history(rounds: unknown[] = []) {
  return { json: async () => ({ rounds }) };
}

function detect(data: unknown) {
  return { json: async () => data };
}

function detectCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/stats/detect");
}

function historyCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/stats/history"));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  channel.handlers = [];
  channel.subscribe.mockClear();
  channel.on.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/stats/detect") return Promise.resolve(detect({ pending: false }));
    return Promise.resolve(history([]));
  });
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("useGameDetection", () => {
  it("detects once on mount and starts polling automatically when pending", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ pending: true }));
      return Promise.resolve(history([]));
    });

    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));

    await waitFor(() => expect(result.current.polling).toBe(true));
    expect(detectCalls()).toHaveLength(2);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(detectCalls()).toHaveLength(3);
  });

  it("startPolling is idempotent and does not create a second interval", async () => {
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));
    await waitFor(() => expect(detectCalls()).toHaveLength(1));

    act(() => {
      result.current.startPolling();
      result.current.startPolling();
    });
    await waitFor(() => expect(result.current.polling).toBe(true));
    expect(detectCalls()).toHaveLength(2);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(detectCalls()).toHaveLength(3);
  });

  it("starts polling when status transitions to in_game", async () => {
    const { result, rerender } = renderHook(
      ({ status }) => useGameDetection({ lobbyId: "lobby-1", status }),
      { initialProps: { status: "waiting" } }
    );
    await waitFor(() => expect(detectCalls()).toHaveLength(1));

    rerender({ status: "in_game" });

    await waitFor(() => expect(result.current.polling).toBe(true));
    expect(detectCalls()).toHaveLength(2);
  });

  it("records done stats, stops polling, and refreshes history with tab switch", async () => {
    const stats = [{ userId: "u-1", displayName: "A", kills: 1, deaths: 1, assists: 0, kd: 1, rouletteWeaponKills: 1 }];
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ done: true, stats }));
      return Promise.resolve(history([{ sessionId: "s-1" }]));
    });

    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "in_game", onSwitchToHistoryTab }));

    await waitFor(() => expect(result.current.lastGameStats).toEqual(stats));
    expect(result.current.polling).toBe(false);
    expect(result.current.roundHistory).toEqual([{ sessionId: "s-1" }]);
    expect(onSwitchToHistoryTab).toHaveBeenCalled();
  });

  it("returns pending without touching lastGameStats", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ pending: true }));
      return Promise.resolve(history([]));
    });
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));

    await waitFor(() => expect(result.current.polling).toBe(true));

    expect(result.current.lastGameStats).toBeNull();
  });

  it("returns false on thrown detect errors without throwing", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.reject(new Error("offline"));
      return Promise.resolve(history([]));
    });
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));

    await waitFor(() => expect(detectCalls()).toHaveLength(1));

    expect(result.current.polling).toBe(false);
  });

  it("stopPolling clears the interval, sets polling false, and is safe twice", async () => {
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));
    await waitFor(() => expect(detectCalls()).toHaveLength(1));
    act(() => result.current.startPolling());
    await waitFor(() => expect(result.current.polling).toBe(true));

    act(() => {
      result.current.stopPolling();
      result.current.stopPolling();
    });
    expect(result.current.polling).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(detectCalls()).toHaveLength(2);
  });

  it("fetchHistory sets rounds, expands the last round, and switches tabs only when rounds exist", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ pending: false }));
      return Promise.resolve(history([{ sessionId: "s-1" }, { sessionId: "s-2" }]));
    });
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting", onSwitchToHistoryTab }));
    await waitFor(() => expect(result.current.roundHistory).toHaveLength(2));

    await act(async () => result.current.fetchHistory(true));

    expect(result.current.expandedRound).toBe("s-2");
    expect(onSwitchToHistoryTab).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ pending: false }));
      return Promise.resolve(history([]));
    });
    await act(async () => result.current.fetchHistory(true));
    expect(onSwitchToHistoryTab).toHaveBeenCalledTimes(1);
  });

  it("realtime game inserts refresh history and detect only before stats exist", async () => {
    const stats = [{ userId: "u-1", displayName: "A", kills: 1, deaths: 1, assists: 0, kd: 1, rouletteWeaponKills: 1 }];
    const { result } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));
    await waitFor(() => expect(detectCalls()).toHaveLength(1));

    act(() => channel.fireInsert());
    await waitFor(() => expect(detectCalls()).toHaveLength(2));
    expect(historyCalls().length).toBeGreaterThanOrEqual(2);

    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/stats/detect") return Promise.resolve(detect({ done: true, stats }));
      return Promise.resolve(history([{ sessionId: "s-1" }]));
    });
    await act(async () => {
      result.current.startPolling();
    });
    await waitFor(() => expect(result.current.lastGameStats).toEqual(stats));
    const callsAfterStats = detectCalls().length;

    act(() => channel.fireInsert());
    await waitFor(() => expect(historyCalls().length).toBeGreaterThanOrEqual(3));
    expect(detectCalls()).toHaveLength(callsAfterStats);
  });

  it("cleans up the poll interval and realtime channel on unmount", async () => {
    const { result, unmount } = renderHook(() => useGameDetection({ lobbyId: "lobby-1", status: "waiting" }));
    await waitFor(() => expect(detectCalls()).toHaveLength(1));
    act(() => result.current.startPolling());
    await waitFor(() => expect(result.current.polling).toBe(true));

    unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(detectCalls()).toHaveLength(2);
  });
});
