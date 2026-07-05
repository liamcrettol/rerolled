import { act, renderHook } from "@testing-library/react";
import { useSupabaseChannel } from "@/hooks/useSupabaseChannel";

class ChannelStub {
  name: string;
  subscribe = jest.fn(() => this);
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
});
