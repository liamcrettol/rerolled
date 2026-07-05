import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/auth/encrypt";
import { encode } from "@auth/core/jwt";

const BASE_URL = process.env.NEXTAUTH_URL!;
const BUNGIE_REDIRECT_URI =
  process.env.BUNGIE_REDIRECT_URI ||
  `${BASE_URL}/api/auth/bungie/callback`;

function errRedirect(step: string, detail?: string) {
  const msg = detail ? `${step}: ${detail}` : step;
  console.error("[bungie/callback] failed at:", msg);
  return NextResponse.redirect(
    `${BASE_URL}/auth/error?error=${encodeURIComponent(msg)}`
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return errRedirect("bungie_error", error);
  if (!state) return errRedirect("no_state");
  if (!code) return errRedirect("no_code");

  // Validate CSRF state against DB
  const { data: storedState } = await adminSupabase
    .from("oauth_states")
    .select("state, return_to")
    .eq("state", state)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!storedState) return errRedirect("state_mismatch");
  const returnTo: string = storedState.return_to ?? "/dashboard";
  await adminSupabase.from("oauth_states").delete().eq("state", state);

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
  const { error: userErr } = await adminSupabase.from("users").upsert(
    { id: userId, display_name: displayName, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (userErr) return errRedirect("user_upsert_failed", userErr.message);

  // Persist bungie account
  const { error: accountErr } = await adminSupabase.from("bungie_accounts").upsert(
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
  );
  if (accountErr) return errRedirect("account_upsert_failed", accountErr.message);

  // Touch this user's lobby member rows after a successful sign-in/reauth.
  // Lobby clients subscribe to lobby_members UPDATE events, so this lets every
  // open lobby retry inventory loading without asking the fireteam to refresh.
  await adminSupabase
    .from("lobby_members")
    .update({
      display_name: displayName,
      bungie_membership_id: membershipId,
      bungie_membership_type: membershipType,
    })
    .eq("user_id", userId);

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
      },
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 30 * 24 * 60 * 60, // 30 days
      salt: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
    });
  } catch (e) {
    return errRedirect("jwt_encode_failed", String(e));
  }

  const response = NextResponse.redirect(`${BASE_URL}${returnTo}`);
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}
