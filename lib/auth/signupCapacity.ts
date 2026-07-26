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
