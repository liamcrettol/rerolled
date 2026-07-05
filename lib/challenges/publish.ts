import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeeklyChallenge } from "@/types/challenges";
import { generateWeeklyChallengeDraft, type GenerateWeeklyChallengeInput, type WeeklyChallengeDraft } from "./generator";
import { validatePublishableChallenge, type ExistingActiveWindow } from "./validate";

// Server-only weekly challenge authoring pipeline (#256). Backs
// `npm run weekly:generate|preview|publish` (scripts/weekly-challenge.ts) —
// pulled out into plain functions so an admin API route could call the same
// code later without duplicating logic.

export interface GenerateAndStoreDraftResult {
  draft: WeeklyChallengeDraft;
  challenge: WeeklyChallenge;
}

/** Generates a deterministic draft and upserts it as a `draft`-status weekly_challenges row. */
export async function generateWeeklyChallengeAndStoreDraft(
  supabase: SupabaseClient,
  input: GenerateWeeklyChallengeInput & { seasonId: string }
): Promise<GenerateAndStoreDraftResult> {
  const draft = generateWeeklyChallengeDraft(input);

  const { data, error } = await supabase
    .from("weekly_challenges")
    .upsert(
      {
        season_id: input.seasonId,
        week_number: draft.weekNumber,
        title: draft.title,
        slug: draft.slug,
        activity_hash: draft.activityHash,
        activity_name_snapshot: draft.activityNameSnapshot,
        activity_mode: draft.activityMode,
        activity_family: draft.activityFamily,
        // Placeholder window; the caller/admin should adjust before publish.
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "draft",
        global_seed: draft.seed,
        rules: draft.rules,
        scoring_config: draft.scoringConfig,
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (error) throw new Error(`failed to store weekly challenge draft: ${error.message}`);

  return { draft, challenge: data as WeeklyChallenge };
}

export interface PreviewResult {
  draft: WeeklyChallengeDraft;
  validation: { valid: boolean; errors: string[] };
}

/** Pure preview — generates a draft and validates it, without touching the database. */
export function previewWeeklyChallengeDraft(input: GenerateWeeklyChallengeInput): PreviewResult {
  const draft = generateWeeklyChallengeDraft(input);
  const validation = validatePublishableChallenge({
    slug: draft.slug,
    activityHash: draft.activityHash,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    rules: draft.rules,
    scoringConfig: draft.scoringConfig,
  });
  return { draft, validation: { valid: validation.valid, errors: [...validation.errors, ...draft.validationWarnings] } };
}

export interface PublishWeeklyChallengeInput {
  slug: string;
  startsAt: string;
  endsAt: string;
}

export interface PublishWeeklyChallengeResult {
  challenge: WeeklyChallenge;
  versionId: string;
}

/**
 * Publishes a draft challenge: validates it, snapshots it into
 * weekly_challenge_versions, and flips status to `scheduled`. Runs started
 * against this challenge reference the version row, so later edits to the
 * (now-published) challenge never retroactively change a run's rules.
 */
export async function publishWeeklyChallenge(
  supabase: SupabaseClient,
  input: PublishWeeklyChallengeInput
): Promise<PublishWeeklyChallengeResult> {
  const { data: existing, error: fetchError } = await supabase
    .from("weekly_challenges")
    .select("*")
    .eq("slug", input.slug)
    .single();
  if (fetchError || !existing) throw new Error(`weekly challenge "${input.slug}" not found`);

  const challenge = existing as WeeklyChallenge;

  const { data: activeWindows, error: activeError } = await supabase
    .from("weekly_challenges")
    .select("slug, starts_at, ends_at")
    .eq("status", "active");
  if (activeError) throw new Error(`failed to load active challenge windows: ${activeError.message}`);

  const existingActiveWindows: ExistingActiveWindow[] = (activeWindows ?? []).map((row) => ({
    slug: row.slug as string,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
  }));

  const validation = validatePublishableChallenge(
    {
      slug: challenge.slug,
      activityHash: challenge.activity_hash,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      rules: challenge.rules,
      scoringConfig: challenge.scoring_config,
    },
    { existingActiveWindows }
  );
  if (!validation.valid) {
    throw new Error(`cannot publish "${input.slug}": ${validation.errors.join("; ")}`);
  }

  const { count } = await supabase
    .from("weekly_challenge_versions")
    .select("*", { count: "exact", head: true })
    .eq("weekly_challenge_id", challenge.id);
  const versionNumber = (count ?? 0) + 1;

  const { data: version, error: versionError } = await supabase
    .from("weekly_challenge_versions")
    .insert({
      weekly_challenge_id: challenge.id,
      version_number: versionNumber,
      title: challenge.title,
      activity_hash: challenge.activity_hash,
      activity_name_snapshot: challenge.activity_name_snapshot,
      rules: challenge.rules,
      scoring_config: challenge.scoring_config,
    })
    .select()
    .single();
  if (versionError || !version) throw new Error(`failed to snapshot version: ${versionError?.message}`);

  const { data: published, error: publishError } = await supabase
    .from("weekly_challenges")
    .update({
      status: "scheduled",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      published_at: new Date().toISOString(),
    })
    .eq("id", challenge.id)
    .select()
    .single();
  if (publishError || !published) throw new Error(`failed to publish: ${publishError?.message}`);

  return { challenge: published as WeeklyChallenge, versionId: version.id as string };
}
