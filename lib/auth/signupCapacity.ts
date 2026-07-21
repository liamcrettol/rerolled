import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";

export type SignupCapacityResult = {
  allowed: boolean;
  already_registered: boolean;
  user_count: number;
};

export async function reserveSignupSlot(
  userId: string,
  site: "rerolled" | "rival"
): Promise<SignupCapacityResult> {
  const { data, error } = await withSupabaseTimeout(
    adminSupabase.rpc("reserve_signup_slot", {
      p_user_id: userId,
      p_site: site,
    })
  );
  if (error) throw new Error(`Signup capacity check failed: ${error.message}`);

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("Signup capacity check returned no result");
  return result as SignupCapacityResult;
}
