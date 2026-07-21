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
