import { act, renderHook } from "@testing-library/react";
import {
  useSupabaseChannel,
  fallbackPollMs,
  POLL_MS_REALTIME_UP,
  POLL_MS_REALTIME_DOWN,
} from "@/hooks/useSupabaseChannel";

type SubscribeCallback = (status: string) => void;

class ChannelStub {
  name: string;
  lastSubscribeCallback: SubscribeCallback | null = null;
  subscribe = jest.fn((cb?: SubscribeCallback) => {
    this.lastSubscribeCallback = cb ?? null;
    return this;
  });
  on = jest.fn(() => this);
  send = jest.fn();

  constructor(name: string) {
    this.name = name;
  }
}

const channels: ChannelStub[] = [];
const removeChannel = jest.fn();
const channel = jest.fn((name: string) => {
  const c = new ChannelStub(name);
  channels.push(c);
  return c;
});

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(() => ({ channel, removeChannel })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  channels.length = 0;
});

describe("useSupabaseChannel", () => {
  it("configures and subscribes once on mount", () => {
    const configure = jest.fn();

    renderHook(() => useSupabaseChannel("lobby:1", configure));

    expect(channel).toHaveBeenCalledWith("lobby:1");
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith(channels[0], expect.objectContaining({ channel }));
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it("removes the live channel on unmount and clears the returned ref", () => {
    const { result, unmount } = renderHook(() => useSupabaseChannel("lobby:1", jest.fn()));
    expect(result.current.channelRef.current).toBe(channels[0]);

    unmount();

    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(result.current.channelRef.current).toBeNull();
  });

  it("tears down the old channel and subscribes a new one when the channel name changes", () => {
    const configure = jest.fn();
    const { rerender } = renderHook(({ name }) => useSupabaseChannel(name, configure), {
      initialProps: { name: "lobby:1" },
    });

    act(() => rerender({ name: "lobby:2" }));

    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(channel).toHaveBeenLastCalledWith("lobby:2");
    expect(configure).toHaveBeenCalledTimes(2);
    expect(channels[1].subscribe).toHaveBeenCalledTimes(1);
  });

  it("does not recreate the channel when only configure gets a new reference", () => {
    const firstConfigure = jest.fn();
    const secondConfigure = jest.fn();
    const { rerender } = renderHook(
      ({ configure }) => useSupabaseChannel("lobby:1", configure),
      { initialProps: { configure: firstConfigure } }
    );

    act(() => rerender({ configure: secondConfigure }));

    expect(channel).toHaveBeenCalledTimes(1);
    expect(removeChannel).not.toHaveBeenCalled();
    expect(firstConfigure).toHaveBeenCalledTimes(1);
    expect(secondConfigure).not.toHaveBeenCalled();
  });

  it("exposes the live channel object while mounted", () => {
    const { result } = renderHook(() => useSupabaseChannel("lobby:1", jest.fn()));
    expect(result.current.channelRef.current).toBe(channels[0]);
  });

  // Realtime health drives how hard the fallback polls hit our own API, which
  // is what put the Vercel account over its Fluid CPU fair-use limit (#364).
  describe("realtime health", () => {
    it("starts as connecting before the socket reports back", () => {
      const { result } = renderHook(() => useSupabaseChannel("lobby:1", jest.fn()));
      expect(result.current.health).toBe("connecting");
    });

    it("reports up once the channel subscribes", () => {
      const { result } = renderHook(() => useSupabaseChannel("lobby:1", jest.fn()));

      act(() => channels[0].lastSubscribeCallback?.("SUBSCRIBED"));

      expect(result.current.health).toBe("up");
    });

    it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
      "reports down on %s, which is what a blocked supabase.co looks like",
      (status) => {
        const { result } = renderHook(() => useSupabaseChannel("lobby:1", jest.fn()));

        act(() => channels[0].lastSubscribeCallback?.(status));

        expect(result.current.health).toBe("down");
      }
    );

    it("resets to connecting when the channel name changes", () => {
      const { result, rerender } = renderHook(
        ({ name }) => useSupabaseChannel(name, jest.fn()),
        { initialProps: { name: "lobby:1" } }
      );
      act(() => channels[0].lastSubscribeCallback?.("SUBSCRIBED"));
      expect(result.current.health).toBe("up");

      act(() => rerender({ name: "lobby:2" }));

      expect(result.current.health).toBe("connecting");
    });
  });

  describe("fallbackPollMs", () => {
    it("polls slowly when realtime is carrying the session", () => {
      expect(fallbackPollMs("up")).toBe(POLL_MS_REALTIME_UP);
    });

    it("polls fast when the poll is the only thing advancing the board", () => {
      expect(fallbackPollMs("down")).toBe(POLL_MS_REALTIME_DOWN);
      // Unknown health must not be treated as healthy: a client stuck in
      // "connecting" still needs its board to move.
      expect(fallbackPollMs("connecting")).toBe(POLL_MS_REALTIME_DOWN);
    });
  });
});
