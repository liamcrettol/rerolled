import type {
  NormalizedPgcrPlayer,
  NormalizedPgcrWeapon,
  NormalizedPvEPgcr,
  NullableNumber,
} from "./types";

type UnknownRecord = Record<string, unknown>;

interface PlayerAccumulator {
  membershipId: string;
  membershipType: number | null;
  displayName?: string;
  characterIds: Set<string>;
  kills: NullableAccumulator;
  assists: NullableAccumulator;
  deaths: NullableAccumulator;
  precisionKills: NullableAccumulator;
  superKills: NullableAccumulator;
  grenadeKills: NullableAccumulator;
  meleeKills: NullableAccumulator;
  weapons: Map<number, NormalizedPgcrWeapon>;
  weaponDataAvailable: boolean;
}

interface NullableAccumulator {
  seen: boolean;
  value: number;
}

const PVP_STANDING_STAT = "standing";

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const part of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[part];
  }
  return current;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readBasicNumber(values: unknown, statName: string): number | null {
  return coerceNumber(readPath(values, [statName, "basic", "value"]));
}

function readFirstNumber(source: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = coerceNumber(readPath(source, path));
    if (value !== null) return value;
  }
  return null;
}

function readFirstString(source: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = coerceString(readPath(source, path));
    if (value !== null) return value;
  }
  return null;
}

function addNullable(acc: NullableAccumulator, value: number | null): void {
  if (value === null) return;
  acc.seen = true;
  acc.value += value;
}

function finishNullable(acc: NullableAccumulator): NullableNumber {
  return acc.seen ? acc.value : null;
}

function makeNullableAccumulator(): NullableAccumulator {
  return { seen: false, value: 0 };
}

function unwrapPgcr(raw: unknown): UnknownRecord | null {
  const record = asRecord(raw);
  if (!record) return null;
  return asRecord(record.Response) ?? record;
}

function readDurationSeconds(pgcr: UnknownRecord, entries: unknown[]): number | null {
  const topLevel = readFirstNumber(pgcr, [
    ["durationSeconds"],
    ["activityDurationSeconds"],
    ["values", "activityDurationSeconds", "basic", "value"],
    ["activityDetails", "durationSeconds"],
    ["activityDetails", "activityDurationSeconds"],
  ]);
  if (topLevel !== null) return Math.round(topLevel);

  const entryDurations = entries
    .map((entry) => readBasicNumber(readPath(entry, ["values"]), "activityDurationSeconds"))
    .filter((value): value is number => value !== null);

  if (!entryDurations.length) return null;
  return Math.round(Math.max(...entryDurations));
}

function readCompleted(pgcr: UnknownRecord, entries: unknown[]): boolean | null {
  const explicit = readPath(pgcr, ["completed"]);
  if (typeof explicit === "boolean") return explicit;

  const topLevel = readFirstNumber(pgcr, [
    ["values", "completed", "basic", "value"],
    ["values", "completion", "basic", "value"],
  ]);
  if (topLevel !== null) return topLevel > 0;

  const perEntry = entries
    .map((entry) => readBasicNumber(readPath(entry, ["values"]), "completed"))
    .filter((value): value is number => value !== null);

  if (!perEntry.length) return null;
  return perEntry.every((value) => value > 0);
}

function calculateEndTime(period: string | null, durationSeconds: number | null): string | null {
  if (!period || durationSeconds === null) return null;
  const startMs = new Date(period).getTime();
  if (!Number.isFinite(startMs)) return null;
  return new Date(startMs + durationSeconds * 1000).toISOString();
}

function getOrCreatePlayer(
  players: Map<string, PlayerAccumulator>,
  entry: unknown,
  membershipId: string,
  membershipType: number | null,
  displayName?: string
): PlayerAccumulator {
  const existing = players.get(membershipId);
  if (existing) return existing;

  const created: PlayerAccumulator = {
    membershipId,
    membershipType,
    displayName,
    characterIds: new Set<string>(),
    kills: makeNullableAccumulator(),
    assists: makeNullableAccumulator(),
    deaths: makeNullableAccumulator(),
    precisionKills: makeNullableAccumulator(),
    superKills: makeNullableAccumulator(),
    grenadeKills: makeNullableAccumulator(),
    meleeKills: makeNullableAccumulator(),
    weapons: new Map<number, NormalizedPgcrWeapon>(),
    weaponDataAvailable: false,
  };

  const characterId = readFirstString(entry, [["characterId"]]);
  if (characterId) created.characterIds.add(characterId);
  players.set(membershipId, created);
  return created;
}

function addWeapon(acc: PlayerAccumulator, weapon: unknown): void {
  const weaponHash = readFirstNumber(weapon, [["referenceId"], ["weaponHash"], ["itemHash"]]);
  if (weaponHash === null) return;

  const values = readPath(weapon, ["values"]);
  const kills =
    readBasicNumber(values, "uniqueWeaponKills") ??
    readBasicNumber(values, "kills") ??
    readFirstNumber(weapon, [["kills"]]) ??
    0;
  const precisionKills =
    readBasicNumber(values, "uniqueWeaponPrecisionKills") ??
    readBasicNumber(values, "precisionKills") ??
    readFirstNumber(weapon, [["precisionKills"]]) ??
    0;
  const weaponType = readFirstString(weapon, [["weaponType"], ["type"]]) ?? undefined;

  const existing = acc.weapons.get(weaponHash);
  if (existing) {
    existing.kills += kills;
    existing.precisionKills += precisionKills;
    if (!existing.weaponType && weaponType) existing.weaponType = weaponType;
    return;
  }

  acc.weapons.set(weaponHash, {
    weaponHash,
    kills,
    precisionKills,
    weaponType,
  });
}

function finalizePlayer(acc: PlayerAccumulator): NormalizedPgcrPlayer {
  return {
    membershipId: acc.membershipId,
    membershipType: acc.membershipType,
    displayName: acc.displayName,
    characterIds: [...acc.characterIds],
    kills: finishNullable(acc.kills),
    assists: finishNullable(acc.assists),
    deaths: finishNullable(acc.deaths),
    precisionKills: finishNullable(acc.precisionKills),
    superKills: finishNullable(acc.superKills),
    grenadeKills: finishNullable(acc.grenadeKills),
    meleeKills: finishNullable(acc.meleeKills),
    weapons: [...acc.weapons.values()].sort((a, b) => a.weaponHash - b.weaponHash),
    weaponDataAvailable: acc.weaponDataAvailable,
  };
}

export function parsePvEPgcr(raw: unknown): NormalizedPvEPgcr {
  const warnings: string[] = [];
  const pgcr = unwrapPgcr(raw);

  if (!pgcr) {
    return {
      instanceId: null,
      activityHash: null,
      activityMode: null,
      activityModes: [],
      period: null,
      startTime: null,
      endTime: null,
      durationSeconds: null,
      completed: null,
      players: [],
      isSupported: false,
      unsupportedReason: "invalid_pgcr",
      warnings: ["PGCR payload was not an object"],
    };
  }

  const activityDetails = readPath(pgcr, ["activityDetails"]);
  const entries = asArray(pgcr.entries);
  const period = readFirstString(pgcr, [["period"]]);
  const durationSeconds = readDurationSeconds(pgcr, entries);
  const activityMode = readFirstNumber(activityDetails, [["mode"], ["activityMode"]]);
  const activityModes = asArray(readPath(activityDetails, ["modes"]))
    .map(coerceNumber)
    .filter((value): value is number => value !== null);

  const normalized: NormalizedPvEPgcr = {
    instanceId: readFirstString(activityDetails, [["instanceId"]]),
    activityHash: readFirstNumber(activityDetails, [["referenceId"], ["directorActivityHash"]]),
    activityMode,
    activityModes,
    period,
    startTime: period,
    endTime: calculateEndTime(period, durationSeconds),
    durationSeconds,
    completed: readCompleted(pgcr, entries),
    players: [],
    isSupported: true,
    warnings,
  };

  if (!entries.length) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "no_entries";
    warnings.push("PGCR had no entries to parse");
    return normalized;
  }

  const hasPvpStanding = entries.some((entry) => {
    const values = asRecord(readPath(entry, ["values"]));
    return Boolean(values && PVP_STANDING_STAT in values);
  });
  if (hasPvpStanding) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "pvp_pgcr";
    warnings.push("PGCR includes standing values and appears to be PvP");
  }

  const players = new Map<string, PlayerAccumulator>();

  entries.forEach((entry, index) => {
    const membershipId = readFirstString(entry, [
      ["player", "destinyUserInfo", "membershipId"],
      ["player", "membershipId"],
      ["membershipId"],
    ]);
    if (!membershipId) {
      warnings.push(`Entry ${index} did not include a membershipId`);
      return;
    }

    const membershipType = readFirstNumber(entry, [
      ["player", "destinyUserInfo", "membershipType"],
      ["player", "membershipType"],
      ["membershipType"],
    ]);
    const displayName = readFirstString(entry, [
      ["player", "destinyUserInfo", "displayName"],
      ["player", "destinyUserInfo", "bungieGlobalDisplayName"],
      ["player", "displayName"],
    ]) ?? undefined;

    const acc = getOrCreatePlayer(players, entry, membershipId, membershipType, displayName);
    const characterId = readFirstString(entry, [["characterId"]]);
    if (characterId) acc.characterIds.add(characterId);

    const values = readPath(entry, ["values"]);
    addNullable(acc.kills, readBasicNumber(values, "kills"));
    addNullable(acc.assists, readBasicNumber(values, "assists"));
    addNullable(acc.deaths, readBasicNumber(values, "deaths"));
    addNullable(acc.precisionKills, readBasicNumber(values, "precisionKills"));
    addNullable(
      acc.superKills,
      readBasicNumber(values, "weaponKillsSuper") ?? readBasicNumber(values, "superKills")
    );
    addNullable(
      acc.grenadeKills,
      readBasicNumber(values, "weaponKillsGrenade") ?? readBasicNumber(values, "grenadeKills")
    );
    addNullable(
      acc.meleeKills,
      readBasicNumber(values, "weaponKillsMelee") ?? readBasicNumber(values, "meleeKills")
    );

    const extended = asRecord(readPath(entry, ["extended"]));
    if (extended && Array.isArray(extended.weapons)) {
      acc.weaponDataAvailable = true;
      for (const weapon of extended.weapons) addWeapon(acc, weapon);
    }
  });

  normalized.players = [...players.values()].map(finalizePlayer);
  if (!normalized.players.length) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "no_players";
    warnings.push("PGCR entries did not contain parseable player membership IDs");
  }

  return normalized;
}
