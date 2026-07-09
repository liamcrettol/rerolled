import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/auth/encrypt";
import { encode } from "@auth/core/jwt";
import { queueCrucibleSync } from "@/lib/crucible/queueSync";

const BASE_URL = process.env.NEXTAUTH_URL!;
const OAUTH_STATE_COOKIE = "bungie_oauth_state";
const OAUTH_RETURN_TO_COOKIE = "bungie_oauth_return_to";
const BUNGIE_REDIRECT_URI =
  process.env.BUNGIE_REDIRECT_URI ||
  `${BASE_URL}/api/auth/bungie/callback`;
const AUTH_DB_RETRY_DELAYS_MS = [0];
const AUTH_DB_WRITE_TIMEOUT_MS = 600;

type SupabaseWriteError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type SupabaseWriteResult = {
  error: SupabaseWriteError | null;
};

// Redirect the user with a STABLE, generic error code only (#239). Raw upstream
// response bodies / exception strings are kept server-side in logs — they must
// not leak into browser history, screenshots, analytics, or copied URLs.
function errRedirect(step: string, detail?: string) {
  console.error("[bungie/callback] failed at:", detail ? `${step}: ${detail}` : step);
  return NextResponse.redirect(
    `${BASE_URL}/auth/error?error=${encodeURIComponent(step)}`
  );
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(OAUTH_RETURN_TO_COOKIE, "", { path: "/", maxAge: 0 });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSupabaseError(error: SupabaseWriteError | null) {
  if (!error) return "unknown";
  return JSON.stringify({
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function isTransientSupabaseError(error: SupabaseWriteError | null) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.code ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    !text.trim() ||
    text.includes("abort") ||
    text.includes("fetch failed") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("connection timed out") ||
    text.includes("cloudflare") ||
    text.includes("522")
  );
}

async function retrySupabaseWrite(
  label: string,
  operation: () => PromiseLike<SupabaseWriteResult>
) {
  let lastError: SupabaseWriteError | null = null;

  for (let attempt = 0; attempt < AUTH_DB_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = AUTH_DB_RETRY_DELAYS_MS[attempt];
    if (delay) await sleep(delay);

    let error: SupabaseWriteError | null;
    try {
      ({ error } = await operation());
    } catch (caught) {
      error = {
        message: caught instanceof Error ? caught.message : String(caught),
      };
    }
    if (!error) return null;

    lastError = error;
    console.error(
      "[bungie/callback] Supabase write failed:",
      `${label} attempt ${attempt + 1}/${AUTH_DB_RETRY_DELAYS_MS.length}: ${formatSupabaseError(error)}`
    );

    if (!isTransientSupabaseError(error)) break;
  }

  return lastError;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return errRedirect("bungie_error", error);
  if (!state) return errRedirect("no_state");
  if (!code) return errRedirect("no_code");

  // Primary CSRF validation is now cookie-based so the login redirect no longer
  // blocks on Supabase just to persist transient OAuth state.
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const cookieReturnTo = req.cookies.get(OAUTH_RETURN_TO_COOKIE)?.value;
  let returnTo = cookieReturnTo || "/dashboard";
  let stateValid = cookieState === state;

  // Fallback for flows that started before the cookie-based state rollout.
  if (!stateValid) {
    const { data: storedState } = await adminSupabase
      .from("oauth_states")
      .select("state, return_to")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!storedState) {
      const response = errRedirect("state_mismatch");
      clearOAuthCookies(response);
      return response;
    }
    returnTo = storedState.return_to ?? "/dashboard";
    stateValid = true;
    await adminSupabase.from("oauth_states").delete().eq("state", state);
  }

  if (!stateValid) {
    const response = errRedirect("state_mismatch");
    clearOAuthCookies(response);
    return response;
  }

  // Exchange auth code for tokens
  let tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    membership_id?: string;
  };
  try {
    const tokenRes = await fetch("https://www.bungie.net/Platform/App/OAuth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-API-Key": process.env.BUNGIE_API_KEY!,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.BUNGIE_CLIENT_ID!,
        client_secret: process.env.BUNGIE_CLIENT_SECRET!,
        redirect_uri: BUNGIE_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      return errRedirect("token_exchange_failed", body.slice(0, 200));
    }
    tokens = await tokenRes.json();
  } catch (e) {
    return errRedirect("token_fetch_threw", String(e));
  }

  // Fetch Bungie memberships - GetMembershipsForCurrentUser returns both
  // the Bungie.net user info AND linked Destiny platform accounts.
  // GetCurrentBungieNetUser does NOT include destinyMemberships.
  let userId: string;
  let displayName: string;
  let membershipId: string;
  let membershipType: number;
  try {
    const userRes = await fetch(
      "https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "X-API-Key": process.env.BUNGIE_API_KEY!,
        },
      }
    );
    if (!userRes.ok) return errRedirect("user_fetch_failed", String(userRes.status));
    const userData = await userRes.json();
    const resp = userData.Response as {
      bungieNetUser: { membershipId: string; uniqueName?: string; displayName?: string };
      destinyMemberships: Array<{ membershipId: string; membershipType: number; displayName?: string }>;
      primaryMembershipId?: string;
    };

    userId = resp.bungieNetUser.membershipId;
    displayName = resp.bungieNetUser.uniqueName ?? resp.bungieNetUser.displayName ?? "Guardian";

    const memberships = resp.destinyMemberships ?? [];
    const primary =
      memberships.find((m) => m.membershipId === resp.primaryMembershipId) ??
      memberships[0];

    if (!primary) return errRedirect("no_destiny_membership");
    membershipId = primary.membershipId;
    membershipType = primary.membershipType;
  } catch (e) {
    return errRedirect("user_fetch_threw", String(e));
  }

  // Encrypt tokens
  let encryptedAccess: string;
  let encryptedRefresh: string | null = null;
  try {
    encryptedAccess = await encryptToken(tokens.access_token);
    if (tokens.refresh_token) encryptedRefresh = await encryptToken(tokens.refresh_token);
  } catch (e) {
    return errRedirect("encrypt_failed", String(e));
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Persist user
  const userErr = await retrySupabaseWrite("users upsert", () =>
    adminSupabase.from("users").upsert(
      { id: userId, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    ).abortSignal(AbortSignal.timeout(AUTH_DB_WRITE_TIMEOUT_MS))
  );
  const skipDependentDbWrites = userErr && isTransientSupabaseError(userErr);
  if (userErr) {
    if (!isTransientSupabaseError(userErr)) {
      return errRedirect("user_upsert_failed", formatSupabaseError(userErr));
    }
    console.error(
      "[bungie/callback] continuing with session-only auth after users upsert outage:",
      formatSupabaseError(userErr)
    );
  }

  // Persist bungie account
  const accountErr = skipDependentDbWrites
    ? null
    : await retrySupabaseWrite("bungie_accounts upsert", () =>
        adminSupabase.from("bungie_accounts").upsert(
          {
            user_id: userId,
            membership_id: membershipId,
            membership_type: membershipType,
            access_token_enc: encryptedAccess,
            refresh_token_enc: encryptedRefresh,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        ).abortSignal(AbortSignal.timeout(AUTH_DB_WRITE_TIMEOUT_MS))
      );
  if (accountErr) {
    if (!isTransientSupabaseError(accountErr)) {
      return errRedirect("account_upsert_failed", formatSupabaseError(accountErr));
    }
    console.error(
      "[bungie/callback] continuing with session-only auth after bungie_accounts upsert outage:",
      formatSupabaseError(accountErr)
    );
  }

  if (!skipDependentDbWrites && !accountErr) {
    queueCrucibleSync(userId).catch((error) => {
      console.error("[bungie/callback] Crucible sync queue failed:", error instanceof Error ? error.message : error);
    });
  }

  // Touch this user's lobby member rows after a successful sign-in/reauth.
  // Lobby clients subscribe to lobby_members UPDATE events, so this lets every
  // open lobby retry inventory loading without asking the fireteam to refresh.
  if (!skipDependentDbWrites) {
    try {
      const { error: lobbyTouchErr } = await adminSupabase
        .from("lobby_members")
        .update({
          display_name: displayName,
          bungie_membership_id: membershipId,
          bungie_membership_type: membershipType,
        })
        .eq("user_id", userId)
        .abortSignal(AbortSignal.timeout(AUTH_DB_WRITE_TIMEOUT_MS));
      if (lobbyTouchErr) {
        console.error("[bungie/callback] lobby member touch failed:", formatSupabaseError(lobbyTouchErr));
      }
    } catch (caught) {
      console.error(
        "[bungie/callback] lobby member touch threw:",
        caught instanceof Error ? caught.message : String(caught)
      );
    }
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  // Build NextAuth JWT directly - bypasses credentials flow which has
  // issues in NextAuth v5 beta when called from server actions.
  let sessionToken: string;
  try {
    sessionToken = await encode({
      token: {
        sub: userId,
        userId,
        bungieMembershipId: membershipId,
        bungieMembershipType: membershipType,
        displayName,
        bungieAccessToken: tokens.access_token,
        bungieRefreshToken: tokens.refresh_token,
        bungieTokenExpiresAt: expiresAt,
      },
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      salt: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
    });
  } catch (e) {
    return errRedirect("jwt_encode_failed", String(e));
  }

  const response = NextResponse.redirect(`${BASE_URL}${returnTo}`);
  clearOAuthCookies(response);
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}
