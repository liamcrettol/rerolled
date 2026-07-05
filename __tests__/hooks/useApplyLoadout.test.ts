import { act, renderHook, waitFor } from "@testing-library/react";
import { useApplyLoadout } from "@/hooks/lobby/useApplyLoadout";

const fetchMock = jest.fn();
const sendCaptainApply = jest.fn();
const startPolling = jest.fn();
const getPreferredInstances = jest.fn(() => ({ kinetic: "i-1" }));
let consoleError: jest.SpyInstance;

function renderApply(overrides = {}) {
  return renderHook(() =>
    useApplyLoadout({
      lobbyId: "lobby-1",
      roundId: "round-1",
      selectedCharId: "char-1",
      isCaptain: false,
      getPreferredInstances,
      sendCaptainApply,
      startPolling,
      ...overrides,
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ json: async () => ({ results: [{ user_id: "u-1", display_name: "A", slot: "kinetic", item_hash: 100, success: true }] }) });
  global.fetch = fetchMock;
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("useApplyLoadout", () => {
  it("no-ops without a character or round", async () => {
    const noChar = renderApply({ selectedCharId: null });
    await act(async () => noChar.result.current.handleApply());
    const noRound = renderApply({ roundId: null });
    await act(async () => noRound.result.current.handleApply());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendCaptainApply).not.toHaveBeenCalled();
  });

  it("broadcasts captain apply only for captains", async () => {
    const captain = renderApply({ isCaptain: true });
    await act(async () => captain.result.current.handleApply());
    expect(sendCaptainApply).toHaveBeenCalledTimes(1);

    sendCaptainApply.mockClear();
    const nonCaptain = renderApply({ isCaptain: false });
    await act(async () => nonCaptain.result.current.handleApply());
    expect(sendCaptainApply).not.toHaveBeenCalled();
  });

  it("posts preferred instances to apply", async () => {
    const { result } = renderApply();
    await act(async () => result.current.handleApply());

    expect(fetchMock).toHaveBeenCalledWith("/api/apply", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        lobbyId: "lobby-1",
        roundId: "round-1",
        characterId: "char-1",
        preferredInstances: { kinetic: "i-1" },
      }),
    }));
  });

  it("stores successful results and starts polling", async () => {
    const { result } = renderApply();
    await act(async () => result.current.handleApply());

    expect(result.current.applyResults).toHaveLength(1);
    expect(startPolling).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight request with the same abort signal and clears applying immediately", async () => {
    let reject!: (reason: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((_resolve, r) => { reject = r; }));
    const { result } = renderApply();

    act(() => { void result.current.handleApply(); });
    expect(result.current.applying).toBe(true);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    act(() => result.current.handleCancelApply());

    expect(signal.aborted).toBe(true);
    expect(result.current.applying).toBe(false);
    await act(async () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not log abort errors but logs other failures and always clears applying", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const abortCase = renderApply();
    await act(async () => abortCase.result.current.handleApply());
    expect(consoleError).not.toHaveBeenCalled();
    expect(abortCase.result.current.applying).toBe(false);

    fetchMock.mockRejectedValueOnce(new Error("boom"));
    const errorCase = renderApply();
    await act(async () => errorCase.result.current.handleApply());
    expect(consoleError).toHaveBeenCalledWith("Apply failed:", expect.any(Error));
    expect(errorCase.result.current.applying).toBe(false);
  });

  it("loads and persists auto apply", () => {
    localStorage.setItem("d2r_autoApply", "true");
    const { result } = renderApply();
    expect(result.current.autoApply).toBe(true);

    act(() => result.current.toggleAutoApply());
    expect(result.current.autoApply).toBe(false);
    expect(localStorage.getItem("d2r_autoApply")).toBe("false");
  });

  it("clears apply results", async () => {
    const { result } = renderApply();
    await act(async () => result.current.handleApply());
    expect(result.current.applyResults).toHaveLength(1);

    act(() => result.current.clearApplyResults());

    expect(result.current.applyResults).toEqual([]);
  });

  it("keeps applying true during the request and false after success", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = renderApply();

    act(() => { void result.current.handleApply(); });
    expect(result.current.applying).toBe(true);
    await act(async () => resolve({ json: async () => ({}) }));

    await waitFor(() => expect(result.current.applying).toBe(false));
  });
});
