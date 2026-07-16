import { auth } from "@/lib/auth";
import { adminSupabase, withSupabaseTimeout } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "@/lib/auth/encrypt";
import { BUNGIE_REAUTH_MESSAGE, isBungieAuthErrorMessage } from "./bungieErrors";
export { isBungieAuthErrorMessage } from "./bungieErrors";

export async function requireSession() {
  const session = await auth();
  if (!session?.userId) {
    throw new Error("Unauthorized");
  }
  return session;
}

function normalizeBungieTokenError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Unsupported state or unable to authenticate data") ||
    msg.includes("TOKEN_ENCRYPTION_KEY")
  ) {
    return new Error(BUNGIE_REAUTH_MESSAGE);
  }
  return err instanceof Error ? err : new Error(msg);
}

const ACCOUNT_TOKEN_COLUMNS =
  "user_id, access_token_enc, refresh_token_enc, expires_at, membership_id, oauth_client_id";

async function findBungieAccount(userId: string, membershipId?: string) {
  const fallbackIds = [...new Set([membershipId, userId].filter(Boolean))] as string[];

  const primary = await withSupabaseTimeout(
    adminSupabase
      .from("bungie_accounts")
      .select(ACCOUNT_TOKEN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle()
  );
  if (primary.data) return primary.data;

  for (const candidateMembershipId of fallbackIds) {
    const fallback = await withSupabaseTimeout(
      adminSupabase
        .from("bungie_accounts")
        .select(ACCOUNT_TOKEN_COLUMNS)
        .eq("membership_id", candidateMembershipId)
        .maybeSingle()
    );
    if (fallback.data) return fallback.data;
  }

  return null;
}

/** Retrieve a decrypted, valid Bungie access token. Refreshes automatically if expired. */
export async function getBungieToken(userId: string, membershipId?: string): Promise<string> {
  const data = await findBungieAccount(userId, membershipId);
  if (!data) {
    throw new Error("No Bungie account found for user");
  }

  // Refresh if expired (with 90s buffer)
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt - 90_000) {
      if (!data.refresh_token_enc) {
        throw new Error("Bungie token expired. Please sign in again");
      }
      // Preview and production use different Bungie OAuth apps but share this
      // table. A refresh token can only be redeemed by the app that issued it,
      // so fail fast with a diagnosable message instead of burning a doomed
      // Bungie call. Rows written before the column existed have null and skip
      // the check.
      if (
        data.oauth_client_id &&
        process.env.BUNGIE_CLIENT_ID &&
        data.oauth_client_id !== process.env.BUNGIE_CLIENT_ID
      ) {
        throw new Error(
          `Bungie token refresh failed (cross-app): tokens were issued by OAuth app ${data.oauth_client_id} but this deployment uses app ${process.env.BUNGIE_CLIENT_ID}. Please sign out and sign in again`
        );
      }
      return refreshBungieToken(data.user_id, data.refresh_token_enc);
    }
  }

  return decryptToken(data.access_token_enc).catch((err) => {
    throw normalizeBungieTokenError(err);
  });
}

async function readStoredTokens(userId: string) {
  const { data } = await withSupabaseTimeout(
    adminSupabase
      .from("bungie_accounts")
      .select("access_token_enc, refresh_token_enc, expires_at")
      .eq("user_id", userId)
      .maybeSingle()
  );
  return data ?? null;
}

// Bungie rotates refresh tokens: redeeming one invalidates it and issues a
// replacement. Two uncoordinated refreshes for the same user (a cron worker, a
// dashboard request, the other Vercel environment) therefore race: the loser
// either gets rejected by Bungie or overwrites the winner's fresh refresh
// token with a dead one, silently breaking background sync until the user
// signs in again. Writes are compare-and-swapped against the exact ciphertext
// that was read, and a lost race adopts the winner's tokens instead of failing.
async function refreshBungieToken(userId: string, refreshTokenEnc: string): Promise<string> {
  const refreshToken = await decryptToken(refreshTokenEnc).catch((err) => {
    throw normalizeBungieTokenError(err);
  });

  const res = await fetch("https://www.bungie.net/Platform/App/OAuth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": process.env.BUNGIE_API_KEY!,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.BUNGIE_CLIENT_ID!,
      client_secret: process.env.BUNGIE_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // A rejected refresh token usually means a concurrent refresh already
    // rotated it. If the stored ciphertext has moved on from the one we
    // redeemed, the other caller won; use their tokens.
    if (res.status === 400) {
      const winnerToken = await recoverFromLostRefreshRace(userId, refreshTokenEnc);
      if (winnerToken) return winnerToken;
    }
    throw new Error(`Bungie token refresh failed (${res.status}): ${body.slice(0, 100)}. Please sign out and sign in again`);
  }

  const tokens = await res.json();
  const encryptedAccess = await encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token
    ? await encryptToken(tokens.refresh_token)
    : null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { data: updated } = await withSupabaseTimeout(
    adminSupabase
      .from("bungie_accounts")
      .update({
        access_token_enc: encryptedAccess,
        ...(encryptedRefresh ? { refresh_token_enc: encryptedRefresh } : {}),
        expires_at: expiresAt,
        oauth_client_id: process.env.BUNGIE_CLIENT_ID ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("refresh_token_enc", refreshTokenEnc)
      .select("user_id")
  );
  if (!updated || updated.length === 0) {
    // Lost the write race: a concurrent refresh landed first and its stored
    // tokens are at least as fresh as ours. Our access token is still valid
    // for this request; do not stomp the stored refresh token.
    console.warn("[auth] concurrent Bungie token refresh detected for user", userId);
  }

  return tokens.access_token;
}

async function recoverFromLostRefreshRace(
  userId: string,
  usedRefreshTokenEnc: string
): Promise<string | null> {
  const stored = await readStoredTokens(userId).catch(() => null);
  if (!stored?.access_token_enc || !stored.refresh_token_enc) return null;
  // Only recover when the stored refresh token differs from the one we just
  // redeemed; an unchanged ciphertext means the token is genuinely dead.
  if (stored.refresh_token_enc === usedRefreshTokenEnc) return null;
  if (stored.expires_at && Date.now() <= new Date(stored.expires_at).getTime() - 90_000) {
    return decryptToken(stored.access_token_enc).catch(() => null);
  }
  // Winner's access token is itself near expiry; refresh once with their
  // refresh token. Terminates: another 400 with an unchanged ciphertext
  // returns null above.
  return refreshBungieToken(userId, stored.refresh_token_enc).catch(() => null);
}
