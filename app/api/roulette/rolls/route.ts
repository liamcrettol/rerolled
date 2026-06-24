import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { bungieGet } from "@/lib/bungie/client";
import { getPerkIcons, getPerkInfos, getWeaponDefinitions } from "@/lib/bungie/definitions";
import { z } from "zod";
import type { WeaponSlot } from "@/types/bungie";

const schema = z.object({ lobbyId: z.string().uuid(), roundId: z.string().uuid() });

// 102 ProfileInventory (vault) · 201 CharacterInventories · 205 CharacterEquipment
// 300 ItemInstances (light) · 304 ItemStats (perk-ADJUSTED stats) · 305 ItemSockets (perks)
const COMPONENTS = "102,201,205,300,304,305";
const PERK_SOCKET_INDICES = [3, 4, 5];

// Match the short stat names used by the prebuilt weapon table so per-instance
// stats line up with the base stats for delta display.
const STAT_NAMES: Record<number, string> = {
  4284893193: "RPM",
  4043523819: "Impact",
  1240592695: "Range",
  3614673599: "Blast Radius",
  2523465841: "Velocity",
  155624089: "Stability",
  943549884: "Handling",
  4188031367: "Reload",
  1345609583: "Aim Assist",
  3555269338: "Zoom",
  3871231066: "Magazine",
  2961396640: "Charge Time",
  447667954: "Draw Time",
  2837207746: "Swing Speed",
  3022301683: "Charge Rate",
  1842278586: "Shield Duration",
  209426660: "Guard Resistance",
  2762071195: "Guard Efficiency",
};

interface Perk { name: string; description: string }
interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perkHashes: number[];
  perks: Perk[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  stats: Record<string, number>;
  lightLevel: number;
}
interface MemberRolls {
  userId: string;
  displayName: string;
  isMe: boolean;
  instances: RollInstance[];
  failed?: boolean; // their profile/inventory couldn't be read (e.g. privacy)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray(v: unknown): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.isArray(v) ? (v as any[]) : [];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId, roundId } = schema.parse(await req.json());

    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, display_name, bungie_membership_type, bungie_membership_id")
      .eq("lobby_id", lobbyId);
    if (!members?.length) return NextResponse.json({ slots: {} });

    const { data: slotRows } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("slot, item_hash")
      .eq("round_id", roundId);

    // slot -> hash, ignoring wildcard (0)
    const slotHash: Partial<Record<WeaponSlot, number>> = {};
    for (const r of slotRows ?? []) {
      if (r.item_hash !== 0) slotHash[r.slot as WeaponSlot] = r.item_hash;
    }
    const loadoutHashes = new Set(Object.values(slotHash));
    if (loadoutHashes.size === 0) return NextResponse.json({ slots: {} });

    const allPerkHashes = new Set<number>();

    // Fetch each member's instances of the loadout weapons in parallel.
    const perMember = await Promise.all(
      members.map(async (member): Promise<{ userId: string; displayName: string; isMe: boolean; byHash: Map<number, RollInstance[]>; failed: boolean }> => {
        const baseInfo = { userId: member.user_id, displayName: member.display_name, isMe: member.user_id === session.userId };
        try {
          const token = await getBungieToken(member.user_id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const profile: any = await bungieGet<unknown>(
            `/Destiny2/${member.bungie_membership_type}/Profile/${member.bungie_membership_id}/?components=${COMPONENTS}`,
            token
          );

          const instanceData: Record<string, { primaryStat?: { value: number } }> = profile?.itemComponents?.instances?.data ?? {};
          const statData: Record<string, { stats?: Record<string, { value: number }> }> = profile?.itemComponents?.stats?.data ?? {};
          const socketData: Record<string, { sockets: Array<{ plugHash?: number; isVisible?: boolean }> }> = profile?.itemComponents?.sockets?.data ?? {};

          const byHash = new Map<number, RollInstance[]>();

          const consider = (item: { itemHash?: number; itemInstanceId?: string }, location: "character" | "vault") => {
            const hash = item.itemHash;
            const id = item.itemInstanceId;
            if (hash == null || !id || !loadoutHashes.has(hash)) return;

            const perkHashes: number[] = [];
            const sockets = socketData[id]?.sockets ?? [];
            for (const idx of PERK_SOCKET_INDICES) {
              const s = sockets[idx];
              if (!s?.plugHash) break;
              if (s.isVisible === false) continue;
              perkHashes.push(s.plugHash);
              allPerkHashes.add(s.plugHash);
            }

            const stats: Record<string, number> = {};
            const rawStats = statData[id]?.stats ?? {};
            for (const [statHash, val] of Object.entries(rawStats)) {
              const name = STAT_NAMES[Number(statHash)];
              if (name) stats[name] = val.value;
            }

            const inst: RollInstance = {
              instanceId: id,
              location,
              perkHashes,
              perks: [],
              perkIcons: {},
              stats,
              lightLevel: instanceData[id]?.primaryStat?.value ?? 0,
            };
            const list = byHash.get(hash) ?? [];
            list.push(inst);
            byHash.set(hash, list);
          };

          for (const [, charEquip] of Object.entries(profile?.characterEquipment?.data ?? {})) {
            for (const item of asArray((charEquip as { items?: unknown }).items)) consider(item, "character");
          }
          for (const [, charInv] of Object.entries(profile?.characterInventories?.data ?? {})) {
            for (const item of asArray((charInv as { items?: unknown }).items)) consider(item, "character");
          }
          for (const item of asArray(profile?.profileInventory?.data?.items)) consider(item, "vault");

          return { ...baseInfo, byHash, failed: false };
        } catch {
          // Couldn't read this member's profile (token expired, privacy, etc.).
          // Still return a column so they don't silently vanish.
          return { ...baseInfo, byHash: new Map<number, RollInstance[]>(), failed: true };
        }
      })
    );

    // Resolve all perk plug hashes to { name, description } in one pass; base
    // stats per weapon. Cosmetic plugs (shaders/ornaments) aren't in the perk
    // map, so they're dropped here.
    const [perkInfoMap, perkIconMap, defs] = await Promise.all([
      getPerkInfos([...allPerkHashes]),
      getPerkIcons([...allPerkHashes]),
      getWeaponDefinitions([...loadoutHashes]),
    ]);

    // Build the response: per slot -> { itemHash, damageType, baseStats, members: [...] }
    const slots: Record<string, { itemHash: number; damageType: string; baseStats: Record<string, number>; members: MemberRolls[] }> = {};
    for (const [slot, hash] of Object.entries(slotHash) as [WeaponSlot, number][]) {
      const memberRolls: MemberRolls[] = [];
      for (const m of perMember) {
        const instances = (m.byHash.get(hash) ?? []).map((inst) => {
          const perkHashes = inst.perkHashes.filter((h) => perkInfoMap.has(h));
          const perkIcons: Record<number, string> = {};
          perkHashes.forEach((h) => {
            const icon = perkIconMap.get(h);
            if (icon) perkIcons[h] = icon;
          });
          return {
            ...inst,
            perkHashes,
            perks: perkHashes.map((h) => perkInfoMap.get(h) as Perk),
            perkIcons,
          };
        });
        memberRolls.push({ userId: m.userId, displayName: m.displayName, isMe: m.isMe, instances, failed: m.failed });
      }
      // Put the caller first.
      memberRolls.sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
      slots[slot] = { itemHash: hash, damageType: defs.get(hash)?.damageType ?? "", baseStats: defs.get(hash)?.stats ?? {}, members: memberRolls };
    }

    return NextResponse.json({ slots });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
