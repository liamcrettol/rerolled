import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { bungieGet } from "@/lib/bungie/client";
import { getPerkIcons, getPerkInfos, getWeaponDefinitions, getWeaponGroupHashes } from "@/lib/bungie/definitions";
import { getSocketRolePlugHash } from "@/lib/bungie/socketRoles";
import { getBestRoll, scoreBestRoll, type BestRoll } from "@/lib/bestRolls";
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

interface Perk { name: string; description: string; stats?: Record<string, number>; communityDescription?: string }
interface RollInstance {
  instanceId: string;
  itemHash: number;
  weaponName?: string;
  weaponIcon?: string;
  weaponWatermark?: string;
  location: "character" | "vault";
  perkHashes: number[];
  perks: Perk[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  barrelStats?: Record<string, number>;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  magazineStats?: Record<string, number>;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  masterworkStats?: Record<string, number>;
  catalystUnlocked?: boolean;
  isBestRoll?: boolean;
  bestRollMatched?: number;
  bestRollTotal?: number;
  baseStats?: Record<string, number>;
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

    // Map every re-released/Adept/craftable variant of each loadout weapon back
    // to that loadout hash, so a player's instances of ALL versions of the gun
    // show up under the slot (#68), not just the exact hash the captain rolled.
    const variantToLoadout = new Map<number, number>();
    for (const lh of loadoutHashes) {
      for (const vh of getWeaponGroupHashes(lh)) variantToLoadout.set(vh, lh);
    }
    // Resolved early (it's an instant in-memory lookup, not a network call) so
    // `consider()` below can read each actual variant's socket role/catalyst
    // metadata while walking a member's live inventory.
    const defs = await getWeaponDefinitions([...new Set([...loadoutHashes, ...variantToLoadout.keys()])]);

    const allPerkHashes = new Set<number>();
    const allInstanceHashes = new Set<number>();

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
            if (hash == null || !id) return;
            // Bucket this instance under the slot's loadout hash if it's any
            // variant of that weapon (re-release / Adept / craftable).
            const loadoutHash = variantToLoadout.get(hash);
            if (loadoutHash == null) return;
            allInstanceHashes.add(hash);

            const perkHashes: number[] = [];
            const sockets = socketData[id]?.sockets ?? [];
            // Was `break` on the first empty/invisible socket - which silently
            // dropped every later index too (e.g. perk2 at index 5 lost
            // whenever index 3 or 4 happened to be empty for that weapon's
            // layout). Socket layouts vary a lot across weapon types (#193),
            // so a gap at one index doesn't mean the rest are gone.
            for (const idx of PERK_SOCKET_INDICES) {
              const s = sockets[idx];
              if (!s?.plugHash || s.isVisible === false) continue;
              perkHashes.push(s.plugHash);
              allPerkHashes.add(s.plugHash);
            }

            const def = defs.get(hash) ?? defs.get(loadoutHash);
            const barrelHash = getSocketRolePlugHash(sockets, def, "barrel");
            const magazineHash = getSocketRolePlugHash(sockets, def, "magazine");
            const masterworkHash = getSocketRolePlugHash(sockets, def, "masterwork");

            if (barrelHash) allPerkHashes.add(barrelHash);
            if (magazineHash) allPerkHashes.add(magazineHash);
            if (masterworkHash) allPerkHashes.add(masterworkHash);

            // Catalyst unlock is per-instance (this specific copy of the
            // weapon), unlike the catalyst perk's name/description which is
            // the same for every copy and resolved once at the slot level
            // below. Compare the live socket's plug against the known
            // catalyst hash - it reads back as the "Empty Catalyst Socket"
            // placeholder until unlocked.
            const catalystUnlocked = Boolean(
              def?.catalystSocketIndex != null &&
                def.catalystPerkHash != null &&
                sockets[def.catalystSocketIndex]?.plugHash === def.catalystPerkHash
            );

            const stats: Record<string, number> = {};
            const rawStats = statData[id]?.stats ?? {};
            for (const [statHash, val] of Object.entries(rawStats)) {
              const name = STAT_NAMES[Number(statHash)];
              if (name) stats[name] = val.value;
            }

            const inst: RollInstance = {
              instanceId: id,
              itemHash: hash,
              location,
              perkHashes,
              perks: [],
              perkIcons: {},
              barrelHash,
              magazineHash,
              masterworkHash,
              catalystUnlocked,
              stats,
              lightLevel: instanceData[id]?.primaryStat?.value ?? 0,
            };
            const list = byHash.get(loadoutHash) ?? [];
            list.push(inst);
            byHash.set(loadoutHash, list);
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

    // Each weapon's intrinsic frame/archetype plug (e.g. "Rapid-Fire Frame",
    // or an exotic's unique named mechanic) and catalyst perk - neither is
    // per-instance, so fold both into the same perk-info batch below.
    for (const def of defs.values()) {
      if (def.intrinsicPerkHash) allPerkHashes.add(def.intrinsicPerkHash);
      if (def.catalystPerkHash) allPerkHashes.add(def.catalystPerkHash);
    }

    // Resolve all perk plug hashes to { name, description } in one pass; base
    // stats per weapon. Cosmetic plugs (shaders/ornaments) aren't in the perk
    // map, so they're dropped here.
    const [perkInfoMap, perkIconMap] = await Promise.all([
      getPerkInfos([...allPerkHashes]),
      getPerkIcons([...allPerkHashes]),
    ]);
    const instanceDefs = await getWeaponDefinitions([...allInstanceHashes]);
    const nameOf = (h: number) => perkInfoMap.get(h)?.name ?? "Unknown";
    const iconOf = (h: number) => perkIconMap.get(h) ?? "";

    // Build the response: per slot -> { itemHash, damageType, baseStats, members: [...] }
    const slots: Record<
      string,
      {
        itemHash: number;
        damageType: string;
        tierType: number;
        baseStats: Record<string, number>;
        weaponName: string;
        weaponIcon: string;
        weaponWatermark?: string;
        intrinsicPerkName?: string;
        intrinsicPerkIcon?: string;
        intrinsicPerkDescription?: string;
        intrinsicPerkCommunityDescription?: string;
        catalystPerkName?: string;
        catalystPerkIcon?: string;
        catalystPerkDescription?: string;
        catalystPerkCommunityDescription?: string;
        bestRoll?: BestRoll;
        members: MemberRolls[];
      }
    > = {};
    for (const [slot, hash] of Object.entries(slotHash) as [WeaponSlot, number][]) {
      const intrinsicHash = defs.get(hash)?.intrinsicPerkHash;
      const intrinsicInfo = intrinsicHash ? perkInfoMap.get(intrinsicHash) : undefined;
      const catalystHash = defs.get(hash)?.catalystPerkHash;
      const catalystInfo = catalystHash ? perkInfoMap.get(catalystHash) : undefined;
      // Community-curated "ideal roll" for this weapon's archetype (unverified
      // provisional baseline - see data/best-rolls/README.md), keyed by weapon
      // type + the same frame name shown as the intrinsic perk above.
      const bestRoll = getBestRoll(defs.get(hash)?.weaponType ?? "", intrinsicInfo?.name);

      const memberRolls: MemberRolls[] = [];
      for (const m of perMember) {
        const instances = (m.byHash.get(hash) ?? []).map((inst) => {
          const perkHashes = inst.perkHashes.filter((h) => perkInfoMap.has(h));
          const perkIcons: Record<number, string> = {};
          perkHashes.forEach((h) => {
            const icon = perkIconMap.get(h);
            if (icon) perkIcons[h] = icon;
          });
          const barrelName = inst.barrelHash ? nameOf(inst.barrelHash) : undefined;
          const magazineName = inst.magazineHash ? nameOf(inst.magazineHash) : undefined;
          const masterworkName = inst.masterworkHash ? nameOf(inst.masterworkHash) : undefined;
          const perks = perkHashes.map((h) => perkInfoMap.get(h) as Perk);
          const instanceDef = instanceDefs.get(inst.itemHash);
          return {
            ...inst,
            weaponName: instanceDef?.name,
            weaponIcon: instanceDef?.icon,
            weaponWatermark: instanceDef?.watermark,
            perkHashes,
            perks,
            perkIcons,
            barrelName,
            barrelIcon: inst.barrelHash ? iconOf(inst.barrelHash) : undefined,
            barrelStats: inst.barrelHash ? perkInfoMap.get(inst.barrelHash)?.stats : undefined,
            magazineName,
            magazineIcon: inst.magazineHash ? iconOf(inst.magazineHash) : undefined,
            magazineStats: inst.magazineHash ? perkInfoMap.get(inst.magazineHash)?.stats : undefined,
            masterworkName,
            masterworkIcon: inst.masterworkHash ? iconOf(inst.masterworkHash) : undefined,
            masterworkStats: inst.masterworkHash ? perkInfoMap.get(inst.masterworkHash)?.stats : undefined,
            isBestRoll: false,
            bestRollMatched: 0,
            bestRollTotal: 0,
            baseStats: instanceDef?.stats,
          };
        });
        memberRolls.push({ userId: m.userId, displayName: m.displayName, isMe: m.isMe, instances, failed: m.failed });
      }
      if (bestRoll) {
        const scored = memberRolls.flatMap((member, memberIndex) =>
          member.instances.map((inst, instanceIndex) => ({
            memberIndex,
            instanceIndex,
            score: scoreBestRoll(bestRoll, {
              barrelName: inst.barrelName,
              magazineName: inst.magazineName,
              perkNames: inst.perks.map((p) => p.name),
              masterworkName: inst.masterworkName,
            }),
          }))
        );
        // An exact match (every populated field hit) is always worth flagging.
        // A partial "closest" match is only worth flagging once it's hit at
        // least 2 curated fields; 0-1 matches is too weak a signal (#216).
        // Only one roll per slot gets the badge across the whole lobby (#222).
        const eligible = scored.filter(({ score }) =>
          score.total > 0 && (score.matched === score.total || score.matched >= 2)
        );
        if (eligible.length > 0) {
          const bestMatched = Math.max(...eligible.map(({ score }) => score.matched));
          const tied = eligible.filter(({ score }) => score.matched === bestMatched);
          const chosen = tied[Math.floor(Math.random() * tied.length)];
          const member = memberRolls[chosen.memberIndex];
          member.instances[chosen.instanceIndex] = {
            ...member.instances[chosen.instanceIndex],
            isBestRoll: true,
            bestRollMatched: chosen.score.matched,
            bestRollTotal: chosen.score.total,
          };
          member.instances.sort((a, b) => Number(b.isBestRoll) - Number(a.isBestRoll));
        }
      }
      // Put the caller first.
      memberRolls.sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
      slots[slot] = {
        itemHash: hash,
        damageType: defs.get(hash)?.damageType ?? "",
        tierType: defs.get(hash)?.tierType ?? 5,
        baseStats: defs.get(hash)?.stats ?? {},
        weaponName: defs.get(hash)?.name ?? "",
        weaponIcon: defs.get(hash)?.icon ?? "",
        weaponWatermark: defs.get(hash)?.watermark,
        intrinsicPerkName: intrinsicInfo?.name,
        intrinsicPerkIcon: intrinsicHash ? iconOf(intrinsicHash) : undefined,
        intrinsicPerkDescription: intrinsicInfo?.description,
        intrinsicPerkCommunityDescription: intrinsicInfo?.communityDescription,
        catalystPerkName: catalystInfo?.name,
        catalystPerkIcon: catalystHash ? iconOf(catalystHash) : undefined,
        catalystPerkDescription: catalystInfo?.description,
        catalystPerkCommunityDescription: catalystInfo?.communityDescription,
        bestRoll: bestRoll ?? undefined,
        members: memberRolls,
      };
    }

    return NextResponse.json({ slots });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
