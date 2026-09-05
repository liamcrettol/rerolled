import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import { assertCronAuth } from "@/lib/auth/cron";
import { findExistingRivalAccountIds } from "@/lib/auth/signupCapacity";

// Triggered by Supabase pg_cron + pg_net with Authorization: Bearer CRON_SECRET.
//
// reserve_signup_slot() (migration 066) runs before the users/bungie_accounts
// upsert in both apps' OAuth callback routes, and releaseSignupSlot() only
// ever runs from an explicit catch block. If the serverless function is
// killed outright (Vercel execution timeout, OOM, platform-level abort)
// after the reservation commits but before the handler resumes, nothing ever
// calls release_signup_slot() - the slot stays reserved forever with no
// matching account, and the shared 150-user cap silently shrinks below its
// real number over time. This sweeps those up (#386).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A normal signup completes in well under a minute; this is generous enough
// that an in-flight OAuth round trip is never mistaken for an orphan.
const ORPHAN_AGE_MS = 30 * 60 * 1000;
const MAX_CANDIDATES = 500;

type Candidate = { user_id: string; first_site: "rerolled" | "rival" };

async function releaseOrphan(userId: string): Promise<boolean> {
  const { data, error } = await withSupabaseTimeout(
    adminSupabase.rpc("release_signup_slot", { p_user_id: userId }),
    1_500
  );
  if (error) {
    console.error("[cron/reconcile-signup-slots] release RPC failed", { userId, reason: error.message });
    return false;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.released);
}

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const cutoff = new Date(Date.now() - ORPHAN_AGE_MS).toISOString();
  const { data, error } = await withSupabaseTimeout(
    adminSupabase
      .from("signup_capacity_users")
      .select("user_id, first_site")
      .lt("created_at", cutoff)
      .limit(MAX_CANDIDATES),
    5_000
  );
  if (error) {
    console.error("[cron/reconcile-signup-slots] candidate query failed", { reason: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as Candidate[];
  const rerolledCandidates = candidates.filter((c) => c.first_site === "rerolled");
  const rivalCandidates = candidates.filter((c) => c.first_site === "rival");

  let rerolledOrphans: string[] = [];
  if (rerolledCandidates.length > 0) {
    // Check bungie_accounts, not users: the callback route's own
    // isReturningUser check (app/api/auth/bungie/callback/route.ts) treats
    // bungie_accounts as the source of truth for "this is a real, completed
    // account". A crash between the users upsert and the bungie_accounts
    // upsert leaves a users row behind with no bungie_accounts row, and a
    // users-only check read that half-written row as a real account,
    // permanently leaking its slot with no way for this cron to reclaim it (#391).
    const { data: existing, error: accountsError } = await withSupabaseTimeout(
      adminSupabase.from("bungie_accounts").select("user_id").in("user_id", rerolledCandidates.map((c) => c.user_id)),
      5_000
    );
    if (accountsError) {
      console.error("[cron/reconcile-signup-slots] rerolled bungie_accounts lookup failed", { reason: accountsError.message });
    } else {
      const existingIds = new Set(((existing ?? []) as { user_id: string }[]).map((row) => row.user_id));
      rerolledOrphans = rerolledCandidates.map((c) => c.user_id).filter((id) => !existingIds.has(id));
    }
  }

  let rivalOrphans: string[] = [];
  let rivalCheckFailed = false;
  if (rivalCandidates.length > 0) {
    const existingRivalIds = await findExistingRivalAccountIds(rivalCandidates.map((c) => c.user_id));
    if (existingRivalIds === null) {
      // Couldn't verify - never release on an unconfirmed check. The next
      // run tries again.
      rivalCheckFailed = true;
    } else {
      const existingSet = new Set(existingRivalIds);
      rivalOrphans = rivalCandidates.map((c) => c.user_id).filter((id) => !existingSet.has(id));
    }
  }

  let released = 0;
  for (const userId of [...rerolledOrphans, ...rivalOrphans]) {
    if (await releaseOrphan(userId)) released++;
  }

  if (released > 0) {
    console.log("[cron/reconcile-signup-slots] released orphaned signup slots", {
      released,
      candidates: candidates.length,
    });
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    rerolledCandidates: rerolledCandidates.length,
    rivalCandidates: rivalCandidates.length,
    released,
    rivalCheckFailed,
  });
}
