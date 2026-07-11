import { getCrucibleActivityPage, getDestinyCharacterIds } from "@/lib/crucible/historyClient";

describe("Crucible Bungie history client", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: typeof fetch }).fetch;
  });

  it("discovers every character on the profile", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ErrorCode: 1, Response: { characters: { data: { char1: {}, char2: {}, char3: {} } } } }),
    }) as unknown as typeof fetch;

    await expect(getDestinyCharacterIds(3, "member", "token")).resolves.toEqual(["char1", "char2", "char3"]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("components=200"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("requests one explicit AllPvP page", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ErrorCode: 1, Response: { activities: [{ period: "2026-07-09", activityDetails: { instanceId: "1", referenceId: 2 } }] } }),
    }) as unknown as typeof fetch;

    const activities = await getCrucibleActivityPage(3, "member", "char1", 4, "token");
    expect(activities).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/count=50&mode=5&page=4/), expect.any(Object));
  });

  it("retries a transient Bungie 5xx instead of failing the page", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ ErrorCode: 1, Response: { activities: [{ period: "2026-07-09", activityDetails: { instanceId: "1", referenceId: 2 } }] } }),
      }) as unknown as typeof fetch;

    const activities = await getCrucibleActivityPage(3, "member", "char1", 0, "token");
    expect(activities).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
