import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";

export type SignupCapacityResult = {
  status: "available" | "already_registered" | "capacity_reached";
  allowed: boolean;
  already_registered: boolean;
  user_count: number;
  max_users: number;
};

export async function reserveSignupSlot(
  userId: string,
  site: "rerolled" | "rival"
): Promise<SignupCapacityResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await withSupabaseTimeout(
        adminSupabase.rpc("reserve_signup_slot", {
          p_user_id: userId,
          p_site: site,
        }),
        1_500
      );
      if (error) throw new Error(error.message);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result || typeof result !== "object") throw new Error("malformed RPC response");
      const row = result as Omit<SignupCapacityResult, "status">;
      if (
        typeof row.allowed !== "boolean" ||
        typeof row.already_registered !== "boolean" ||
        typeof row.user_count !== "number" ||
        typeof row.max_users !== "number"
      ) throw new Error("malformed RPC response");

      return {
        ...row,
        status: row.already_registered ? "already_registered" : row.allowed ? "available" : "capacity_reached",
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Signup capacity verification failed: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

// Reverse direction of Rival's own calls into this app. Used only by the
// reconcile-signup-slots cron to check whether a stale reservation with
// first_site "rival" ever became a real Rival account - Rerolled owns the
// shared ledger but has no local table to check that against. Reuses
// RIVAL_SYNC_SECRET (the same shared secret Rival's calls into this app are
// already validated against) instead of provisioning a new secret for this
// direction. Returns null - never an empty array - when the check couldn't
// be completed, so a transient failure here can never be misread as "none
// of these exist" and cause a live account's slot to be released.
export async function findExistingRivalAccountIds(userIds: string[]): Promise<string[] | null> {
  const baseUrl = process.env.RIVAL_BASE_URL ?? "https://rival.rerolled.io";
  const secret = process.env.RIVAL_SYNC_SECRET;
  if (!secret) {
    console.error("[signupCapacity] cannot check Rival accounts for reconciliation: RIVAL_SYNC_SECRET not configured");
    return null;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/rerolled/account-exists`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userIds }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error("[signupCapacity] Rival account-exists check failed", { status: response.status });
      return null;
    }

    const body = (await response.json().catch(() => null)) as { existingUserIds?: unknown } | null;
    if (!body || !Array.isArray(body.existingUserIds) || !body.existingUserIds.every((id) => typeof id === "string")) {
      console.error("[signupCapacity] malformed Rival account-exists response");
      return null;
    }
    return body.existingUserIds;
  } catch (error) {
    console.error("[signupCapacity] Rival account-exists check errored", {
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

// Best-effort compensation for a reservation that never became a real
// account (e.g. the users/bungie_accounts upsert failed right after
// reserveSignupSlot succeeded). Never throws - this runs from an already-
// failing callback path, so a release failure here must not mask or replace
// the original error redirect. Worst case the slot stays reserved, same as
// before this existed.
export async function releaseSignupSlot(userId: string, site: "rerolled" | "rival"): Promise<void> {
  try {
    const { error } = await withSupabaseTimeout(
      adminSupabase.rpc("release_signup_slot", { p_user_id: userId }),
      1_500
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[signupCapacity] failed to release an orphaned slot", {
      site,
      userId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
  }
}
