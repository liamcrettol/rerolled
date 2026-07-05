import catalogRaw from "@/data/activities/activity-catalog.json";

export type ActivityPillar = "pve" | "pvp";

export type ActivityKind =
  | "raid"
  | "dungeon"
  | "grandmaster"
  | "crucible"
  | "trials"
  | "iron-banner";

export interface ScoreAttackActivity {
  name: string;
  pillar: ActivityPillar;
  kind: ActivityKind;
  activityHashes: number[];
}

interface ActivityCatalog {
  generatedAt: string;
  source: string;
  activities: ScoreAttackActivity[];
}

export interface ActivityPoolFilter {
  pillar?: ActivityPillar;
  kinds?: ActivityKind[];
}

export interface WeeklyActivitySelection {
  weekKey: string;
  activity: ScoreAttackActivity;
}

const catalog = catalogRaw as ActivityCatalog;

function hasValidHashList(activity: ScoreAttackActivity): boolean {
  return activity.activityHashes.every((hash) => Number.isInteger(hash) && hash > 0);
}

function dedupeActivities(activities: ScoreAttackActivity[]): ScoreAttackActivity[] {
  const seen = new Set<string>();
  const result: ScoreAttackActivity[] = [];

  for (const activity of activities) {
    const key = `${activity.pillar}:${activity.kind}:${activity.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(activity);
  }

  return result;
}

export function getActivityCatalogMetadata(): Pick<ActivityCatalog, "generatedAt" | "source"> {
  return { generatedAt: catalog.generatedAt, source: catalog.source };
}

export function getActivityPool(filter: ActivityPoolFilter = {}): ScoreAttackActivity[] {
  const kinds = filter.kinds ? new Set(filter.kinds) : null;
  return dedupeActivities(
    catalog.activities.filter((activity) => {
      if (!activity.name.trim()) return false;
      if (!hasValidHashList(activity)) return false;
      if (filter.pillar && activity.pillar !== filter.pillar) return false;
      if (kinds && !kinds.has(activity.kind)) return false;
      return true;
    })
  );
}

function weekKeyFor(date: Date): string {
  const reset = new Date(date);
  reset.setUTCHours(17, 0, 0, 0);

  const day = reset.getUTCDay();
  const daysSinceTuesday = (day + 5) % 7;
  reset.setUTCDate(reset.getUTCDate() - daysSinceTuesday);

  if (date.getTime() < reset.getTime()) reset.setUTCDate(reset.getUTCDate() - 7);

  return reset.toISOString().slice(0, 10);
}

function stableIndex(seed: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % size;
}

export function pickWeeklyActivity(
  date: Date = new Date(),
  filter: ActivityPoolFilter = { pillar: "pve" }
): WeeklyActivitySelection {
  const pool = getActivityPool(filter);
  if (!pool.length) {
    throw new Error("No activities available for weekly selection");
  }

  const weekKey = weekKeyFor(date);
  const seedParts = [
    weekKey,
    filter.pillar ?? "all",
    ...(filter.kinds ?? []),
  ];
  const activity = pool[stableIndex(seedParts.join("|"), pool.length)];

  return { weekKey, activity };
}
