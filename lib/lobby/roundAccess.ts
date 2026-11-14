// Lobby and round ids are readable by anyone (anon SELECT policies), and the
// roll, draft and apply routes take both from the request body. Checking the
// caller against lobbyId and then writing by roundId let a member (or captain)
// of one lobby write into another lobby's round. Every such write first proves
// the round belongs to the lobby the caller was authorized for.
import { adminSupabase } from "@/lib/supabase/admin";

type Db = typeof adminSupabase;

export type RoundAccess = "ok" | "round_mismatch" | "not_member";

export const ROUND_MISMATCH_ERROR = "That round doesn't belong to this lobby. Refresh and try again.";
export const NOT_MEMBER_ERROR = "You're not in this lobby. Try rejoining.";

/**
 * Throws on a database error, so an outage reads as a server error and never
 * as "not allowed" or, worse, as allowed.
 */
export async function checkRoundAccess(
  input: { lobbyId: string; roundId: string; memberUserId?: string },
  db: Db = adminSupabase
): Promise<RoundAccess> {
  const { data: round, error: roundError } = await db
    .from("lobby_rounds")
    .select("lobby_id")
    .eq("id", input.roundId)
    .maybeSingle();
  if (roundError) throw new Error(`Round lookup failed: ${roundError.message}`);
  if (!round || round.lobby_id !== input.lobbyId) return "round_mismatch";

  if (input.memberUserId) {
    const { data: member, error: memberError } = await db
      .from("lobby_members")
      .select("user_id")
      .eq("lobby_id", input.lobbyId)
      .eq("user_id", input.memberUserId)
      .maybeSingle();
    if (memberError) throw new Error(`Lobby membership lookup failed: ${memberError.message}`);
    if (!member) return "not_member";
  }
  return "ok";
}
