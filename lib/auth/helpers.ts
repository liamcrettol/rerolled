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

async function findBungieAccount(userId: string, membershipId?: string) {
  const fallbackIds = [...new Set([membershipId, userId].filter(Boolean))] as string[];

  const primary = await withSupabaseTimeout(
    adminSupabase
      .from("bungie_accounts")
      .select("user_id, access_token_enc, refresh_token_enc, expires_at, membership_id")
      .eq("user_id", userId)
      .maybeSingle()
  );
  if (primary.data) return primary.data;

  for (const candidateMembershipId of fallbackIds) {
    const fallback = await withSupabaseTimeout(
      adminSupabase
        .from("bungie_accounts")
        .select("user_id, access_token_enc, refresh_token_enc, expires_at, membership_id")
        .eq("membership_id", candidateMembershipId)
        .maybeSingle()
    );
    if (fallback.data) return fallback.data;
  }

  return null;
}

async function refreshSessionBungieToken(refreshToken: string): Promise<string> {
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
    throw new Error(`Bungie token refresh failed (${res.status}): ${body.slice(0, 100)}. Please sign out and sign in again`);
  }

  const tokens = await res.json();
  return tokens.access_token;
}

async function getSessionBungieToken(userId: string, membershipId?: string) {
  const session = await auth();
  if (!session?.bungieAccessToken || session.userId !== userId) return null;
  if (membershipId && session.bungieMembershipId !== membershipId) return null;

  if (session.bungieTokenExpiresAt) {
    const expiresAt = new Date(session.bungieTokenExpiresAt).getTime();
    if (Date.now() > expiresAt - 90_000) {
      if (!session.bungieRefreshToken) return null;
      return refreshSessionBungieToken(session.bungieRefreshToken);
    }
  }

  return session.bungieAccessToken;
}

/** Retrieve a decrypted, valid Bungie access token. Refreshes automatically if expired. */
export async function getBungieToken(userId: string, membershipId?: string): Promise<string> {
  let data: Awaited<ReturnType<typeof findBungieAccount>>;
  try {
    data = await findBungieAccount(userId, membershipId);
  } catch (err) {
    const sessionToken = await getSessionBungieToken(userId, membershipId);
    if (sessionToken) return sessionToken;
    throw err;
  }
  if (!data) {
    const sessionToken = await getSessionBungieToken(userId, membershipId);
    if (sessionToken) return sessionToken;
    throw new Error("No Bungie account found for user");
  }

  // Refresh if expired (with 90s buffer)
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt - 90_000) {
      if (!data.refresh_token_enc) {
        throw new Error("Bungie token expired. Please sign in again");
      }
      const refreshToken = await decryptToken(data.refresh_token_enc).catch((err) => {
        throw normalizeBungieTokenError(err);
      });
      return refreshBungieToken(data.user_id, refreshToken);
    }
  }

  return decryptToken(data.access_token_enc).catch((err) => {
    throw normalizeBungieTokenError(err);
  });
}

async function refreshBungieToken(userId: string, refreshToken: string): Promise<string> {
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

  await withSupabaseTimeout(
    adminSupabase
      .from("bungie_accounts")
      .update({
        access_token_enc: encryptedAccess,
        ...(encryptedRefresh ? { refresh_token_enc: encryptedRefresh } : {}),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
  );

  return tokens.access_token;
}
