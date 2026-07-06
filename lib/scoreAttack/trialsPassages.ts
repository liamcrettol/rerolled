import type { BungieProfileResponse, DestinyItemComponent } from "@/types/bungie";

export type TrialsPassageCapturePhase = "pre_match" | "post_match";

export interface TrialsPassageSnapshot {
  passageInstanceId: string;
  passageItemHash: number;
  passageName: string | null;
  bucketHash: number;
  source: "profile" | "character" | "equipment";
  characterId: string | null;
  wins: number;
  roundsWon: number;
  activeWinStreak: number;
  flawlessWinStreak: number;
  flawlessProgress: number | null;
  isFlawless: boolean;
  isComplete: boolean;
  trialsMultiplier: number | null;
  objectiveProgress: Record<string, number>;
}

export interface TrialsPassageCard {
  cardId: string;
  winsOnCard: number;
  isFlawless: boolean;
  isComplete: boolean;
}

interface SnapshotCandidate {
  snapshot: TrialsPassageSnapshot;
  score: number[];
}

export const TRIALS_PASSAGE_BUCKET_HASH = 1345459588;
export const TRIALS_PASSAGE_WINS_OBJECTIVE_HASH = 1586211619;
export const TRIALS_PASSAGE_FLAWLESS_OBJECTIVE_HASHES = [2369244651, 2211480687] as const;
export const TRIALS_PASSAGE_ROUNDS_WON_OBJECTIVE_HASH = 984122744;
export const TRIALS_PASSAGE_ACTIVE_WIN_STREAK_OBJECTIVE_HASH = 3682362563;
export const TRIALS_PASSAGE_FLAWLESS_WIN_STREAK_OBJECTIVE_HASH = 2552133478;
export const TRIALS_PASSAGE_MULTIPLIER_OBJECTIVE_HASH = 250385543;

const KNOWN_TRIALS_PASSAGE_HASH_NAMES: Record<number, string> = {
  46532100: "Flawless Lighthouse Passage",
  261249154: "Lighthouse Passage",
  583402086: "Lighthouse Passage",
  7665310: "Passage of Ferocity",
  1181381245: "Passage of Confidence",
  1135392623: "Lighthouse Passage",
  1230518056: "Flawless Lighthouse Passage",
  1274359594: "Passage of Ferocity",
  1456070807: "Trials of Osiris Passage",
  1507733275: "Any 7-Win Passage",
  1600065451: "Passage of Mercy",
  1766769942: "Trials of Osiris Passage",
  2001563200: "Passage of Persistence",
  2512224275: "Passage of Confidence",
  2874354445: "Trials of Osiris Passage",
  2879309661: "Passage of Wealth",
  2969369458: "Trials of Osiris Passage",
  2974160011: "Flawless Lighthouse Passage",
  2994359731: "Passage of Wealth",
  3125852681: "Passage of Mercy",
  3527775273: "Flawless Lighthouse Passage",
  3657523445: "Lighthouse Passage",
  3937592460: "Passage of Persistence",
};

const TRIALS_PASSAGE_OBJECTIVE_HASHES = new Set<number>([
  TRIALS_PASSAGE_WINS_OBJECTIVE_HASH,
  ...TRIALS_PASSAGE_FLAWLESS_OBJECTIVE_HASHES,
  TRIALS_PASSAGE_ROUNDS_WON_OBJECTIVE_HASH,
  TRIALS_PASSAGE_ACTIVE_WIN_STREAK_OBJECTIVE_HASH,
  TRIALS_PASSAGE_FLAWLESS_WIN_STREAK_OBJECTIVE_HASH,
  TRIALS_PASSAGE_MULTIPLIER_OBJECTIVE_HASH,
]);

function objectiveValue(progress: Record<string, number>, objectiveHash: number): number {
  const value = progress[String(objectiveHash)];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function detectFlawless(progress: Record<string, number>, name: string | null): boolean {
  if ((name ?? "").toLowerCase().includes("flawless")) return true;
  return TRIALS_PASSAGE_FLAWLESS_OBJECTIVE_HASHES.some((hash) => objectiveValue(progress, hash) >= 1);
}

function detectComplete(snapshot: Pick<TrialsPassageSnapshot, "wins" | "isFlawless" | "passageName">): boolean {
  const lowerName = (snapshot.passageName ?? "").toLowerCase();
  return snapshot.wins >= 7 || snapshot.isFlawless || lowerName.includes("lighthouse") || lowerName.includes("7-win");
}

function compareScore(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

function sourcePriority(source: TrialsPassageSnapshot["source"]): number {
  switch (source) {
    case "character":
      return 3;
    case "profile":
      return 2;
    case "equipment":
      return 1;
    default:
      return 0;
  }
}

function buildObjectiveProgress(itemInstanceId: string, profile: BungieProfileResponse): Record<string, number> {
  const objectives = profile.itemComponents?.objectives?.data?.[itemInstanceId]?.objectives ?? [];
  return Object.fromEntries(
    objectives
      .filter((objective) => typeof objective?.objectiveHash === "number" && typeof objective?.progress === "number")
      .map((objective) => [String(objective.objectiveHash), objective.progress]),
  );
}

function isTrialsPassage(item: DestinyItemComponent, objectiveProgress: Record<string, number>): boolean {
  if (item.bucketHash === TRIALS_PASSAGE_BUCKET_HASH) return true;
  if (KNOWN_TRIALS_PASSAGE_HASH_NAMES[item.itemHash]) return true;
  return Object.keys(objectiveProgress).some((hash) => TRIALS_PASSAGE_OBJECTIVE_HASHES.has(Number(hash)));
}

function buildSnapshot(
  item: DestinyItemComponent,
  source: TrialsPassageSnapshot["source"],
  characterId: string | null,
  objectiveProgress: Record<string, number>,
): TrialsPassageSnapshot {
  const passageName = KNOWN_TRIALS_PASSAGE_HASH_NAMES[item.itemHash] ?? null;
  const flawlessProgress = TRIALS_PASSAGE_FLAWLESS_OBJECTIVE_HASHES
    .map((hash) => objectiveProgress[String(hash)])
    .find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
  const snapshot: TrialsPassageSnapshot = {
    passageInstanceId: item.itemInstanceId,
    passageItemHash: item.itemHash,
    passageName,
    bucketHash: item.bucketHash,
    source,
    characterId,
    wins: objectiveValue(objectiveProgress, TRIALS_PASSAGE_WINS_OBJECTIVE_HASH),
    roundsWon: objectiveValue(objectiveProgress, TRIALS_PASSAGE_ROUNDS_WON_OBJECTIVE_HASH),
    activeWinStreak: objectiveValue(objectiveProgress, TRIALS_PASSAGE_ACTIVE_WIN_STREAK_OBJECTIVE_HASH),
    flawlessWinStreak: objectiveValue(objectiveProgress, TRIALS_PASSAGE_FLAWLESS_WIN_STREAK_OBJECTIVE_HASH),
    flawlessProgress,
    isFlawless: detectFlawless(objectiveProgress, passageName),
    isComplete: false,
    trialsMultiplier: objectiveProgress[String(TRIALS_PASSAGE_MULTIPLIER_OBJECTIVE_HASH)] ?? null,
    objectiveProgress,
  };
  snapshot.isComplete = detectComplete(snapshot);
  return snapshot;
}

function dedupeSnapshots(snapshots: TrialsPassageSnapshot[]): TrialsPassageSnapshot[] {
  const byInstance = new Map<string, TrialsPassageSnapshot>();
  for (const snapshot of snapshots) {
    const existing = byInstance.get(snapshot.passageInstanceId);
    if (!existing || sourcePriority(snapshot.source) > sourcePriority(existing.source)) {
      byInstance.set(snapshot.passageInstanceId, snapshot);
    }
  }
  return [...byInstance.values()];
}

function snapshotDelta(post: TrialsPassageSnapshot, pre: TrialsPassageSnapshot | null): number {
  if (!pre) {
    return Object.keys(post.objectiveProgress).length + post.wins + post.roundsWon;
  }

  const trackedHashes = new Set<string>([
    ...Object.keys(post.objectiveProgress),
    ...Object.keys(pre.objectiveProgress),
  ]);

  let delta = 0;
  for (const hash of trackedHashes) {
    delta += Math.abs((post.objectiveProgress[hash] ?? 0) - (pre.objectiveProgress[hash] ?? 0));
  }
  return delta;
}

function candidateScore(
  post: TrialsPassageSnapshot,
  pre: TrialsPassageSnapshot | null,
  isWin: boolean | null,
): number[] {
  const winsDelta = post.wins - (pre?.wins ?? 0);
  const roundsDelta = post.roundsWon - (pre?.roundsWon ?? 0);
  const flawlessChanged = Number(post.isFlawless) - Number(pre?.isFlawless ?? false);
  const streakDelta = post.activeWinStreak - (pre?.activeWinStreak ?? 0);
  const progressDelta = snapshotDelta(post, pre);
  const matchedBefore = pre ? 1 : 0;

  if (isWin === true) {
    return [
      winsDelta > 0 ? 1 : 0,
      winsDelta,
      roundsDelta,
      streakDelta,
      progressDelta,
      matchedBefore,
      post.wins,
      post.roundsWon,
      Number(post.isFlawless),
      sourcePriority(post.source),
    ];
  }

  return [
    progressDelta > 0 ? 1 : 0,
    flawlessChanged !== 0 ? 1 : 0,
    matchedBefore,
    progressDelta,
    post.wins,
    post.roundsWon,
    Number(post.isFlawless),
    sourcePriority(post.source),
  ];
}

function bestCandidate(candidates: SnapshotCandidate[]): TrialsPassageSnapshot | null {
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => (
    compareScore(current.score, best.score) > 0 ? current : best
  )).snapshot;
}

export function extractTrialsPassageSnapshots(profile: BungieProfileResponse): TrialsPassageSnapshot[] {
  const snapshots: TrialsPassageSnapshot[] = [];

  const pushSnapshot = (
    item: DestinyItemComponent,
    source: TrialsPassageSnapshot["source"],
    characterId: string | null,
  ) => {
    if (!item?.itemInstanceId) return;
    const progress = buildObjectiveProgress(item.itemInstanceId, profile);
    if (!isTrialsPassage(item, progress)) return;
    snapshots.push(buildSnapshot(item, source, characterId, progress));
  };

  for (const item of profile.profileInventory?.data?.items ?? []) {
    pushSnapshot(item, "profile", null);
  }

  for (const [characterId, inventory] of Object.entries(profile.characterInventories?.data ?? {})) {
    for (const item of inventory.items ?? []) pushSnapshot(item, "character", characterId);
  }

  for (const [characterId, equipment] of Object.entries(profile.characterEquipment?.data ?? {})) {
    for (const item of equipment.items ?? []) pushSnapshot(item, "equipment", characterId);
  }

  return dedupeSnapshots(snapshots);
}

export function selectTrialsPassageCard(args: {
  preMatchSnapshots?: TrialsPassageSnapshot[] | null;
  postMatchSnapshots?: TrialsPassageSnapshot[] | null;
  isWin?: boolean | null;
}): TrialsPassageCard | null {
  const preMatch = args.preMatchSnapshots ?? [];
  const postMatch = args.postMatchSnapshots ?? [];
  const preByInstance = new Map(preMatch.map((snapshot) => [snapshot.passageInstanceId, snapshot]));

  const selected = bestCandidate(
    postMatch.map((snapshot) => ({
      snapshot,
      score: candidateScore(snapshot, preByInstance.get(snapshot.passageInstanceId) ?? null, args.isWin ?? null),
    })),
  ) ?? bestCandidate(
    preMatch.map((snapshot) => ({
      snapshot,
      score: [snapshot.wins, snapshot.roundsWon, Number(snapshot.isFlawless), sourcePriority(snapshot.source)],
    })),
  );

  if (!selected) return null;
  return {
    cardId: selected.passageInstanceId,
    winsOnCard: selected.wins,
    isFlawless: selected.isFlawless,
    isComplete: selected.isComplete,
  };
}
