import { NextRequest, NextResponse } from "next/server";

const SAFE_RETURN_TO_RE = /^\/(join|lobby)\/[A-Z0-9]{4,8}$/;
const OAUTH_STATE_COOKIE = "bungie_oauth_state";
const OAUTH_RETURN_TO_COOKIE = "bungie_oauth_return_to";
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();
  const reauth = req.nextUrl.searchParams.has("reauth");
  const rawReturnTo = req.nextUrl.searchParams.get("returnTo");
  const returnTo = rawReturnTo && SAFE_RETURN_TO_RE.test(rawReturnTo) ? rawReturnTo : null;

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

  const response = NextResponse.redirect(authUrl.toString());
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
  if (returnTo) {
    response.cookies.set(OAUTH_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    });
  } else {
    response.cookies.set(OAUTH_RETURN_TO_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
