import type {
  NormalizedPgcr,
  NormalizedPgcrPlayer,
  NormalizedPgcrWeapon,
  NormalizedPvpPgcr,
  NormalizedPvpPgcrPlayer,
  NormalizedPvpPgcrTeam,
  NormalizedPvEPgcr,
  NullableNumber,
} from "./types";

type UnknownRecord = Record<string, unknown>;

interface PlayerAccumulator {
  membershipId: string;
  membershipType: number | null;
  displayName?: string;
  emblemPath?: string;
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

interface PvpPlayerAccumulator extends PlayerAccumulator {
  team: number | null;
  standing: number | null;
  isWin: boolean | null;
  score: NullableAccumulator;
  medalKeys: Set<string>;
  scoreboardValues: Record<string, number>;
  completed: boolean | null;
}

interface NullableAccumulator {
  seen: boolean;
  value: number;
}

const PVP_STANDING_STAT = "standing";
const KNOWN_MEDAL_KEYS = new Map<string, string>([
  ["seventh_column", "seventh_column"],
  ["column_vii", "seventh_column"],
  ["ran_out_of_medals", "ran_out_of_medals"],
  ["we_ran_out_of_medals", "ran_out_of_medals"],
  ["ghost_in_the_night", "ghost_in_the_night"],
  ["iron_banner_high_score", "iron_banner_high_score"],
]);

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
  displayName?: string,
  emblemPath?: string,
): PlayerAccumulator {
  const existing = players.get(membershipId);
  if (existing) return existing;

  const created: PlayerAccumulator = {
    membershipId,
    membershipType,
    displayName,
    emblemPath,
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

function getOrCreatePvpPlayer(
  players: Map<string, PvpPlayerAccumulator>,
  entry: unknown,
  membershipId: string,
  membershipType: number | null,
  displayName?: string,
  emblemPath?: string,
): PvpPlayerAccumulator {
  const existing = players.get(membershipId);
  if (existing) return existing;

  const base = getOrCreatePlayer(players as unknown as Map<string, PlayerAccumulator>, entry, membershipId, membershipType, displayName, emblemPath) as PvpPlayerAccumulator;
  base.team = null;
  base.standing = null;
  base.isWin = null;
  base.score = makeNullableAccumulator();
  base.medalKeys = new Set<string>();
  base.scoreboardValues = {};
  base.completed = null;
  players.set(membershipId, base);
  return base;
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
    emblemPath: acc.emblemPath,
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

function finalizePvpPlayer(acc: PvpPlayerAccumulator): NormalizedPvpPgcrPlayer {
  return {
    ...finalizePlayer(acc),
    team: acc.team,
    standing: acc.standing,
    isWin: acc.isWin,
    score: finishNullable(acc.score),
    medalKeys: [...acc.medalKeys].sort(),
    scoreboardValues: Object.fromEntries(Object.entries(acc.scoreboardValues).sort(([a], [b]) => a.localeCompare(b))),
    completed: acc.completed,
  };
}

function baseNormalizedPgcr(pgcr: UnknownRecord, entries: unknown[]) {
  const activityDetails = readPath(pgcr, ["activityDetails"]);
  const period = readFirstString(pgcr, [["period"]]);
  const durationSeconds = readDurationSeconds(pgcr, entries);
  const activityMode = readFirstNumber(activityDetails, [["mode"], ["activityMode"]]);
  const activityModes = asArray(readPath(activityDetails, ["modes"]))
    .map(coerceNumber)
    .filter((value): value is number => value !== null);

  return {
    instanceId: readFirstString(activityDetails, [["instanceId"]]),
    activityHash: readFirstNumber(activityDetails, [["referenceId"], ["directorActivityHash"]]),
    directorActivityHash: readFirstNumber(activityDetails, [["directorActivityHash"]]),
    activityMode,
    activityModes,
    period,
    startTime: period,
    endTime: calculateEndTime(period, durationSeconds),
    durationSeconds,
    completed: readCompleted(pgcr, entries),
    warnings: [] as string[],
  };
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function readScoreboardValues(scoreboardValues: unknown): Record<string, number> {
  const record = asRecord(scoreboardValues);
  if (record) {
    return Object.fromEntries(
      Object.entries(record)
        .map(([key, value]) => [normalizeKey(key), coerceNumber(readPath(value, ["basic", "value"])) ?? coerceNumber(value)])
        .filter((entry): entry is [string, number] => entry[1] !== null),
    );
  }

  const entries = asArray(scoreboardValues)
    .map((entry) => {
      const key = readFirstString(entry, [["statId"], ["key"], ["name"], ["displayName"]]);
      const value = readFirstNumber(entry, [["basic", "value"], ["value"]]);
      return key && value !== null ? [normalizeKey(key), value] : null;
    })
    .filter((entry): entry is [string, number] => entry !== null);

  return Object.fromEntries(entries);
}

function addScoreboardValues(target: Record<string, number>, incoming: Record<string, number>): void {
  for (const [key, value] of Object.entries(incoming)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function extractKnownMedalKeys(scoreboardValues: Record<string, number>): string[] {
  const medalKeys = new Set<string>();
  for (const [key, value] of Object.entries(scoreboardValues)) {
    if (value <= 0) continue;
    const normalized = normalizeKey(key);
    for (const [pattern, medalKey] of KNOWN_MEDAL_KEYS) {
      if (normalized.includes(pattern)) medalKeys.add(medalKey);
    }
  }
  return [...medalKeys];
}

function hasNumericOnlyKeys(scoreboardValues: Record<string, number>): boolean {
  const keys = Object.keys(scoreboardValues);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

function readPvpTeams(pgcr: UnknownRecord): NormalizedPvpPgcrTeam[] {
  return asArray(pgcr.teams)
    .map((team) => ({
      teamId: readFirstNumber(team, [["teamId"], ["teamId", "basic", "value"]]),
      // Bungie reports team standing/score as stat objects (standing.basic.value),
      // not plain numbers, so read the nested value first.
      standing: readFirstNumber(team, [["standing", "basic", "value"], ["standing"]]),
      score: readFirstNumber(team, [["score", "basic", "value"], ["score"], ["values", "score", "basic", "value"]]),
      teamName: readFirstString(team, [["teamName"]]) ?? undefined,
    }))
    .filter((team) => team.teamId !== null || team.standing !== null || team.score !== null || team.teamName);
}

function determineWin(teamId: number | null, standing: number | null, teams: NormalizedPvpPgcrTeam[]): boolean | null {
  const teamStanding =
    (teamId !== null ? teams.find((team) => team.teamId === teamId)?.standing : null) ??
    standing;
  const opposingStandings = teams
    .filter((team) => teamId === null || team.teamId !== teamId)
    .map((team) => team.standing)
    .filter((value): value is number => value !== null);

  if (teamStanding !== null && opposingStandings.length > 0) {
    if (opposingStandings.every((value) => teamStanding < value)) return true;
    if (opposingStandings.some((value) => teamStanding > value)) return false;
  }
  // Fallback for team modes: a player's own standing is 0 for victory, 1 for
  // defeat, so use it directly when team-vs-team comparison is unavailable.
  if (standing === 0) return true;
  if (standing === 1) return false;
  return null;
}

function appearsToBePvp(pgcr: UnknownRecord): boolean {
  const entries = asArray(pgcr.entries);
  if (asArray(pgcr.teams).length > 0) return true;
  return entries.some((entry) => {
    const values = asRecord(readPath(entry, ["values"]));
    return Boolean(values && PVP_STANDING_STAT in values) || readFirstNumber(entry, [["standing"]]) !== null;
  });
}

export function parsePvEPgcr(raw: unknown): NormalizedPvEPgcr {
  const pgcr = unwrapPgcr(raw);

  if (!pgcr) {
    return {
      kind: "pve",
      instanceId: null,
      activityHash: null,
      directorActivityHash: null,
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

  const entries = asArray(pgcr.entries);
  const base = baseNormalizedPgcr(pgcr, entries);
  const normalized: NormalizedPvEPgcr = {
    kind: "pve",
    ...base,
    players: [],
    isSupported: true,
  };

  if (!entries.length) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "no_entries";
    normalized.warnings.push("PGCR had no entries to parse");
    return normalized;
  }

  if (appearsToBePvp(pgcr)) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "pvp_pgcr";
    normalized.warnings.push("PGCR includes standing/team data and appears to be PvP");
  }

  const players = new Map<string, PlayerAccumulator>();

  entries.forEach((entry, index) => {
    const membershipId = readFirstString(entry, [
      ["player", "destinyUserInfo", "membershipId"],
      ["player", "membershipId"],
      ["membershipId"],
    ]);
    if (!membershipId) {
      normalized.warnings.push(`Entry ${index} did not include a membershipId`);
      return;
    }

    const membershipType = readFirstNumber(entry, [
      ["player", "destinyUserInfo", "membershipType"],
      ["player", "membershipType"],
      ["membershipType"],
    ]);
    const displayName = readFirstString(entry, [
      ["player", "destinyUserInfo", "bungieGlobalDisplayName"],
      ["player", "destinyUserInfo", "displayName"],
      ["player", "displayName"],
    ]) ?? undefined;
    const emblemPath = readFirstString(entry, [
      ["player", "destinyUserInfo", "emblemPath"],
      ["player", "destinyUserInfo", "iconPath"],
      ["emblemPath"],
    ]) ?? undefined;

    const acc = getOrCreatePlayer(players, entry, membershipId, membershipType, displayName, emblemPath);
    acc.emblemPath ??= emblemPath;
    const characterId = readFirstString(entry, [["characterId"]]);
    if (characterId) acc.characterIds.add(characterId);

    const values = readPath(entry, ["values"]);
    addNullable(acc.kills, readBasicNumber(values, "kills"));
    addNullable(acc.assists, readBasicNumber(values, "assists"));
    addNullable(acc.deaths, readBasicNumber(values, "deaths"));
    addNullable(acc.precisionKills, readBasicNumber(values, "precisionKills"));
    addNullable(
      acc.superKills,
      readBasicNumber(values, "weaponKillsSuper") ?? readBasicNumber(values, "superKills"),
    );
    addNullable(
      acc.grenadeKills,
      readBasicNumber(values, "weaponKillsGrenade") ?? readBasicNumber(values, "grenadeKills"),
    );
    addNullable(
      acc.meleeKills,
      readBasicNumber(values, "weaponKillsMelee") ?? readBasicNumber(values, "meleeKills"),
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
    normalized.warnings.push("PGCR entries did not contain parseable player membership IDs");
  }

  return normalized;
}

export function parsePvpPgcr(raw: unknown): NormalizedPvpPgcr {
  const pgcr = unwrapPgcr(raw);

  if (!pgcr) {
    return {
      kind: "pvp",
      instanceId: null,
      activityHash: null,
      directorActivityHash: null,
      activityMode: null,
      activityModes: [],
      period: null,
      startTime: null,
      endTime: null,
      durationSeconds: null,
      completed: null,
      players: [],
      teams: [],
      isSupported: false,
      unsupportedReason: "invalid_pgcr",
      warnings: ["PGCR payload was not an object"],
    };
  }

  const entries = asArray(pgcr.entries);
  const base = baseNormalizedPgcr(pgcr, entries);
  const teams = readPvpTeams(pgcr);
  const normalized: NormalizedPvpPgcr = {
    kind: "pvp",
    ...base,
    players: [],
    teams,
    isSupported: true,
  };

  if (!entries.length) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "no_entries";
    normalized.warnings.push("PGCR had no entries to parse");
    return normalized;
  }

  const players = new Map<string, PvpPlayerAccumulator>();

  entries.forEach((entry, index) => {
    const membershipId = readFirstString(entry, [
      ["player", "destinyUserInfo", "membershipId"],
      ["player", "membershipId"],
      ["membershipId"],
    ]);
    if (!membershipId) {
      normalized.warnings.push(`Entry ${index} did not include a membershipId`);
      return;
    }

    const membershipType = readFirstNumber(entry, [
      ["player", "destinyUserInfo", "membershipType"],
      ["player", "membershipType"],
      ["membershipType"],
    ]);
    const displayName = readFirstString(entry, [
      ["player", "destinyUserInfo", "bungieGlobalDisplayName"],
      ["player", "destinyUserInfo", "displayName"],
      ["player", "displayName"],
    ]) ?? undefined;
    const emblemPath = readFirstString(entry, [
      ["player", "destinyUserInfo", "emblemPath"],
      ["player", "destinyUserInfo", "iconPath"],
      ["emblemPath"],
    ]) ?? undefined;

    const acc = getOrCreatePvpPlayer(players, entry, membershipId, membershipType, displayName, emblemPath);
    acc.emblemPath ??= emblemPath;
    const characterId = readFirstString(entry, [["characterId"]]);
    if (characterId) acc.characterIds.add(characterId);

    const values = readPath(entry, ["values"]);
    addNullable(acc.kills, readBasicNumber(values, "kills"));
    addNullable(acc.assists, readBasicNumber(values, "assists"));
    addNullable(acc.deaths, readBasicNumber(values, "deaths"));
    addNullable(acc.precisionKills, readBasicNumber(values, "precisionKills"));
    addNullable(
      acc.superKills,
      readBasicNumber(values, "weaponKillsSuper") ?? readBasicNumber(values, "superKills"),
    );
    addNullable(
      acc.grenadeKills,
      readBasicNumber(values, "weaponKillsGrenade") ?? readBasicNumber(values, "grenadeKills"),
    );
    addNullable(
      acc.meleeKills,
      readBasicNumber(values, "weaponKillsMelee") ?? readBasicNumber(values, "meleeKills"),
    );
    addNullable(acc.score, readBasicNumber(values, "score") ?? readFirstNumber(entry, [["score"]]));

    const team = readBasicNumber(values, "team") ?? readFirstNumber(entry, [["team"]]);
    const standing = readFirstNumber(entry, [["standing"]]) ?? readBasicNumber(values, "standing");
    if (team !== null) acc.team = team;
    if (standing !== null) acc.standing = standing;
    acc.isWin = determineWin(acc.team, acc.standing, teams);

    // Per-entry completion, kept per-player (unlike the base
    // NormalizedPgcrBase.completed aggregate, which requires every player's
    // entry to show completed - see the NormalizedPvpPgcrPlayer doc comment).
    const completed = readBasicNumber(values, "completed");
    if (completed !== null) acc.completed = completed > 0;

    const extended = asRecord(readPath(entry, ["extended"]));
    if (extended && Array.isArray(extended.weapons)) {
      acc.weaponDataAvailable = true;
      for (const weapon of extended.weapons) addWeapon(acc, weapon);
    }

    const scoreboardValues = readScoreboardValues(readPath(entry, ["extended", "scoreboardValues"]));
    addScoreboardValues(acc.scoreboardValues, scoreboardValues);
    for (const medalKey of extractKnownMedalKeys(scoreboardValues)) acc.medalKeys.add(medalKey);
  });

  normalized.players = [...players.values()].map(finalizePvpPlayer);
  if (!normalized.players.length) {
    normalized.isSupported = false;
    normalized.unsupportedReason = "no_players";
    normalized.warnings.push("PGCR entries did not contain parseable player membership IDs");
  }

  if (
    normalized.players.some((player) =>
      hasNumericOnlyKeys(player.scoreboardValues) && player.medalKeys.length === 0,
    )
  ) {
    normalized.warnings.push("PvP scoreboardValues used numeric-only keys; medalKeys were left empty because medal manifest lookup is not wired");
  }

  return normalized;
}

export function parsePgcr(raw: unknown): NormalizedPgcr {
  const pgcr = unwrapPgcr(raw);
  if (pgcr && appearsToBePvp(pgcr)) return parsePvpPgcr(pgcr);
  return parsePvEPgcr(pgcr ?? raw);
}
