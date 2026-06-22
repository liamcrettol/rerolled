import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getWeapons } from "@/lib/bungie/inventory";
import { ensureManifest } from "@/lib/manifest/lookup";
import { computeWeaponIntersection } from "@/lib/roulette/intersection";
import { z } from "zod";

const schema = z.object({ lobbyId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { lobbyId } = schema.parse(await req.json());

    // Get all members of this lobby
    const { data: members } = await adminSupabase
      .from("lobby_members")
      .select("user_id, bungie_membership_type, bungie_membership_id")
      .eq("lobby_id", lobbyId);

    if (!members?.length) {
      return NextResponse.json({ error: "No members found" }, { status: 404 });
    }

    await ensureManifest();

    // Fetch weapons for each member (using their stored tokens)
    const memberWeapons = new Map<string, Awaited<ReturnType<typeof getWeapons>>>();

    for (const member of members) {
      try {
        const token = await getBungieToken(member.user_id);
        const weapons = await getWeapons(
          member.bungie_membership_type,
          member.bungie_membership_id,
          token
        );
        memberWeapons.set(member.user_id, weapons);
      } catch {
        // Member token expired or missing — skip them
      }
    }

    const intersection = computeWeaponIntersection(memberWeapons);

    // Also return weapon details for display (keyed by hash)
    const weaponDetails: Record<number, { name: string; icon: string; weaponType: string; damageType: string }> = {};
    for (const weapons of Array.from(memberWeapons.values())) {
      for (const w of weapons) {
        if (!weaponDetails[w.itemHash]) {
          weaponDetails[w.itemHash] = {
            name: w.name,
            icon: w.icon,
            weaponType: w.weaponType,
            damageType: w.damageType,
          };
        }
      }
    }

    void session;
    return NextResponse.json({ intersection, weaponDetails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
