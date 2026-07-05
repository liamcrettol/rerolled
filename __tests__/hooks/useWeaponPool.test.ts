import { act, renderHook, waitFor } from "@testing-library/react";
import { useWeaponPool, type WeaponDetail } from "@/hooks/lobby/useWeaponPool";

const fetchMock = jest.fn();

const pulse: WeaponDetail = {
  name: "Pulse",
  icon: "/pulse.png",
  weaponType: "Pulse Rifle",
  damageType: "Kinetic",
  tierType: 5,
  tierName: "Legendary",
  ammoType: "Primary",
  stats: {},
};
const sidearmSpecial: WeaponDetail = { ...pulse, name: "Rocket Sidearm", weaponType: "Sidearm", ammoType: "Special" };
const shotgun: WeaponDetail = { ...pulse, name: "Shotgun", weaponType: "Shotgun", ammoType: "Special" };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

function ok(data: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => data });
}

describe("useWeaponPool", () => {
  it("loads intersection data into every returned state bucket", async () => {
    ok({
      intersection: { kinetic: [100], energy: [200], power: [300] },
      weaponDetails: { "100": pulse },
      instancePerks: { "100": [{ instanceId: "i-1", perks: ["p"], location: "vault" }] },
      collectionHashes: [999],
      weaponReleases: { "100": [101] },
      equippedHashes: { kinetic: 100, energy: null, power: 300 },
      memberEquipped: { "u-1": { kinetic: 100 } },
    });
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));

    await act(async () => result.current.loadIntersection("char-1"));

    expect(result.current.intersection).toEqual({ kinetic: [100], energy: [200], power: [300] });
    expect(result.current.weaponDetails["100"]).toEqual(pulse);
    expect(result.current.instancePerks["100"][0].instanceId).toBe("i-1");
    expect([...result.current.collectionHashes]).toEqual([999]);
    expect(result.current.weaponReleases).toEqual({ "100": [101] });
    expect(result.current.equippedHashes).toEqual({ kinetic: 100, power: 300 });
    expect(result.current.memberEquipped).toEqual({ "u-1": { kinetic: 100 } });
  });

  it("sets an error and leaves existing data untouched when intersection is missing", async () => {
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));
    ok({ intersection: { kinetic: [100], energy: [], power: [] }, weaponDetails: { "100": pulse } });
    await act(async () => result.current.loadIntersection(null));
    const existingDetails = result.current.weaponDetails;

    ok({ error: "No shared weapons" });
    await act(async () => result.current.loadIntersection(null));

    expect(result.current.intersectionError).toBe("No shared weapons");
    expect(result.current.weaponDetails).toBe(existingDetails);
    expect(result.current.intersection).toEqual({ kinetic: [100], energy: [], power: [] });
  });

  it("captures auth issue metadata when inventory loading requires reauth", async () => {
    ok({
      error: "Couldn't load inventory for: Memo#5527. The affected player should sign in with Bungie again.",
      failedUserIds: ["user-2"],
      failedDisplayNames: ["Memo#5527"],
      reauthRequired: true,
    });
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));

    await act(async () => result.current.loadIntersection(null));

    expect(result.current.intersectionError).toContain("Memo#5527");
    expect(result.current.intersectionAuthIssue).toEqual({
      failedUserIds: ["user-2"],
      failedDisplayNames: ["Memo#5527"],
      reauthRequired: true,
    });
  });

  it("sets a thrown network error message and stops loading", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));

    await act(async () => result.current.loadIntersection(null));

    expect(result.current.intersectionError).toBe("offline");
    expect(result.current.loading).toBe(false);
  });

  it("sets loading during fetch and clears it on success and error", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));

    act(() => { void result.current.loadIntersection(null); });
    expect(result.current.loading).toBe(true);
    await act(async () => resolve({ json: async () => ({ intersection: { kinetic: [], energy: [], power: [] } }) }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockRejectedValueOnce("boom");
    await act(async () => result.current.loadIntersection(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.intersectionError).toBe("Network error");
  });

  it("formats weapon display types", async () => {
    ok({ intersection: { kinetic: [100, 200], energy: [], power: [] }, weaponDetails: { "100": pulse, "200": sidearmSpecial } });
    const { result } = renderHook(() => useWeaponPool("lobby-1", new Set()));
    await act(async () => result.current.loadIntersection(null));

    expect(result.current.weaponDisplayType(200)).toBe("Sidearm · Special");
    expect(result.current.weaponDisplayType(100)).toBe("Pulse Rifle");
    expect(result.current.weaponDisplayType(999)).toBe("");
  });

  it("returns the same intersection without bans and filters by display type with bans", async () => {
    ok({
      intersection: { kinetic: [100, 200], energy: [300], power: [] },
      weaponDetails: { "100": pulse, "200": sidearmSpecial, "300": shotgun },
    });
    const { result, rerender } = renderHook(({ banned }) => useWeaponPool("lobby-1", banned), {
      initialProps: { banned: new Set<string>() },
    });
    await act(async () => result.current.loadIntersection(null));
    const raw = result.current.intersection;
    expect(result.current.effectiveIntersection).toBe(raw);

    rerender({ banned: new Set(["Sidearm · Special", "Shotgun · Special"]) });

    expect(result.current.effectiveIntersection).toEqual({ kinetic: [100], energy: [], power: [] });

    ok({
      intersection: { kinetic: [100, 200], energy: [300], power: [] },
      weaponDetails: { "100": { ...pulse, weaponType: "Auto Rifle" }, "200": sidearmSpecial, "300": shotgun },
    });
    await act(async () => result.current.loadIntersection(null));
    rerender({ banned: new Set(["Auto Rifle"]) });
    expect(result.current.effectiveIntersection?.kinetic).toEqual([200]);
  });
});
