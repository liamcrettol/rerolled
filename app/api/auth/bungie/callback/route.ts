import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/auth/encrypt";

const BASE_URL = process.env.NEXTAUTH_URL!;

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
    .select("state")
    .eq("state", state)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!storedState) return errRedirect("state_mismatch");
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

  // Fetch Bungie user profile
  let profile: {
    membershipId: string;
    uniqueName?: string;
    displayName?: string;
    destinyMemberships?: Array<{ membershipId: string; membershipType: number }>;
  };
  try {
    const userRes = await fetch(
      "https://www.bungie.net/Platform/User/GetCurrentBungieNetUser/",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "X-API-Key": process.env.BUNGIE_API_KEY!,
        },
      }
    );
    if (!userRes.ok) return errRedirect("user_fetch_failed", String(userRes.status));
    const userData = await userRes.json();
    profile = userData.Response;
  } catch (e) {
    return errRedirect("user_fetch_threw", String(e));
  }

  const primaryMembership = profile.destinyMemberships?.[0];
  const userId: string = profile.membershipId;
  const displayName: string = profile.uniqueName ?? profile.displayName ?? "Guardian";
  const membershipId: string = primaryMembership?.membershipId ?? userId;
  const membershipType: number = primaryMembership?.membershipType ?? 0;

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

  // Create one-time auth code
  const authCode = crypto.randomUUID();
  const { error: codeErr } = await adminSupabase.from("auth_codes").insert({
    code: authCode,
    user_id: userId,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  });
  if (codeErr) return errRedirect("auth_code_insert_failed", codeErr.message);

  return NextResponse.redirect(`${BASE_URL}/auth/complete?code=${authCode}`);
}
