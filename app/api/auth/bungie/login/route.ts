import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

const SAFE_RETURN_TO_RE = /^\/(join|lobby)\/[A-Z0-9]{4,8}$/;

export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();
  const reauth = req.nextUrl.searchParams.has("reauth");
  const rawReturnTo = req.nextUrl.searchParams.get("returnTo");
  const returnTo = rawReturnTo && SAFE_RETURN_TO_RE.test(rawReturnTo) ? rawReturnTo : null;

  // Store state in DB - cookies aren't reliable across serverless redirects
  await adminSupabase.from("oauth_states").insert({
    state,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...(returnTo ? { return_to: returnTo } : {}),
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const redirectUri =
    process.env.BUNGIE_REDIRECT_URI ||
    `${baseUrl}/api/auth/bungie/callback`;

  const authUrl = new URL("https://www.bungie.net/en/OAuth/Authorize");
  authUrl.searchParams.set("client_id", process.env.BUNGIE_CLIENT_ID!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  // Do NOT add scope - Bungie rejects any scope parameter
  // reauth=true forces Bungie to show the account-picker even when already signed in
  if (reauth) authUrl.searchParams.set("reauth", "true");

  return NextResponse.redirect(authUrl.toString());
}
