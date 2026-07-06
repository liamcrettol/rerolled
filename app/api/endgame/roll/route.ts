import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, getBungieToken, isBungieAuthErrorMessage } from "@/lib/auth/helpers";
import { bungieGet, getInventoryItemDefinitions } from "@/lib/bungie/client";
import { getWeapons } from "@/lib/bungie/inventory";
import type { BungieProfileResponse } from "@/types/bungie";
import {
  buildEndgameWeaponRoll,
  CLASS_NAMES,
  collectEndgameArmorCandidateHashes,
  pickEndgameActivity,
  selectExoticArmorOptions,
  type EndgameActivityKind,
} from "@/lib/endgame/randomizer";

const schema = z.object({
  characterId: z.string().min(1),
  activityKinds: z.array(z.enum(["grandmaster", "dungeon", "raid"])).min(1),
});

const PROFILE_COMPONENTS = [200, 201, 205, 102].join(",");

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const activityKinds = [...new Set(body.activityKinds)] as EndgameActivityKind[];
    const token = await getBungieToken(session.userId, session.bungieMembershipId);

    const [weapons, profile] = await Promise.all([
      getWeapons(session.bungieMembershipType, session.bungieMembershipId, token),
      bungieGet<BungieProfileResponse>(
        `/Destiny2/${session.bungieMembershipType}/Profile/${session.bungieMembershipId}/?components=${PROFILE_COMPONENTS}`,
        token
      ),
    ]);

    const armorDefinitions = await getInventoryItemDefinitions(
      collectEndgameArmorCandidateHashes(profile, body.characterId),
      token
    );

    const { character, options } = selectExoticArmorOptions(
      profile,
      armorDefinitions,
      body.characterId
    );

    if (options.length === 0) {
      return NextResponse.json(
        { error: `No exotic armor found for your ${CLASS_NAMES[character.classType] ?? "selected"} character.` },
        { status: 409 }
      );
    }

    const activity = pickEndgameActivity(activityKinds);
    const loadout = buildEndgameWeaponRoll(weapons);
    const exoticArmor = options[Math.floor(Math.random() * options.length)];

    return NextResponse.json({
      character: {
        characterId: character.characterId,
        classType: character.classType,
        className: CLASS_NAMES[character.classType] ?? "Guardian",
        light: character.light,
        emblemPath: character.emblemPath,
      },
      activity,
      loadout,
      exoticArmor,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = isBungieAuthErrorMessage(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
