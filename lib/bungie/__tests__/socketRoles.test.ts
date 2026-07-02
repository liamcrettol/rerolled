import { getSocketRolePlugHash, type WeaponDefinition } from "../socketRoles";

describe("getSocketRolePlugHash", () => {
  const sockets: Array<{ plugHash: number; isVisible?: boolean }> = [
    { plugHash: 100 },
    { plugHash: 101 },
    { plugHash: 102 },
    { plugHash: 103 },
    { plugHash: 104 },
    { plugHash: 105 },
    { plugHash: 106 },
    { plugHash: 107 },
  ];

  it("reads the role-specific index from weapon metadata", () => {
    const def = {
      socketRoleIndices: { barrel: 1, magazine: 2, masterwork: 7 },
    } as WeaponDefinition;

    expect(getSocketRolePlugHash(sockets, def, "barrel")).toBe(101);
    expect(getSocketRolePlugHash(sockets, def, "magazine")).toBe(102);
    expect(getSocketRolePlugHash(sockets, def, "masterwork")).toBe(107);
  });

  it("does not fall back to legacy indices for known weapons without a role match", () => {
    const def = {
      socketRoleIndices: { barrel: 1, magazine: 2, masterwork: null },
    } as WeaponDefinition;

    expect(getSocketRolePlugHash(sockets, def, "masterwork")).toBeUndefined();
  });

  it("keeps legacy fallback only when no definition is available", () => {
    expect(getSocketRolePlugHash(sockets, undefined, "masterwork")).toBe(106);
  });

  it("ignores hidden role sockets", () => {
    const def = {
      socketRoleIndices: { barrel: 1, magazine: 2, masterwork: 7 },
    } as WeaponDefinition;
    const hiddenSockets = [...sockets];
    hiddenSockets[7] = { plugHash: 107, isVisible: false };

    expect(getSocketRolePlugHash(hiddenSockets, def, "masterwork")).toBeUndefined();
  });
});
