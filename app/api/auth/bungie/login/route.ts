import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();
  const reauth = req.nextUrl.searchParams.has("reauth");

  // Store state in DB - cookies aren't reliable across serverless redirects
  await adminSupabase.from("oauth_states").insert({
    state,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  const authUrl = new URL("https://www.bungie.net/en/OAuth/Authorize");
  authUrl.searchParams.set("client_id", process.env.BUNGIE_CLIENT_ID!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  // Do NOT add scope - Bungie rejects any scope parameter
  // reauth=true forces Bungie to show the account-picker even when already signed in
  if (reauth) authUrl.searchParams.set("reauth", "true");

  return NextResponse.redirect(authUrl.toString());
}
