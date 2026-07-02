import type { getWeaponDefinitions } from "./definitions";

export type WeaponDefinition = Awaited<ReturnType<typeof getWeaponDefinitions>> extends Map<number, infer T>
  ? T
  : never;

export type SocketRole = "barrel" | "magazine" | "masterwork";

interface LiveSocket {
  plugHash?: number;
  isVisible?: boolean;
}

const LEGACY_FALLBACK_INDICES: Record<SocketRole, number> = {
  barrel: 1,
  magazine: 2,
  masterwork: 6,
};

export function getSocketRolePlugHash(
  sockets: LiveSocket[],
  def: WeaponDefinition | undefined,
  role: SocketRole
): number | undefined {
  const index = def?.socketRoleIndices?.[role];
  if (index == null) {
    // Only fall back when no definition metadata is available at all. If a
    // known weapon has no role match, returning nothing is safer than reading
    // a cosmetic/mod socket as gameplay data.
    if (def) return undefined;
    return sockets[LEGACY_FALLBACK_INDICES[role]]?.plugHash;
  }

  const socket = sockets[index];
  if (!socket?.plugHash || socket.isVisible === false) return undefined;
  return socket.plugHash;
}
