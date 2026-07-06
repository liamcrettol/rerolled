import Link from "next/link";

// Friendly, stable messages for the generic error codes the OAuth callback
// emits (#239). Raw upstream detail is never passed here — only these codes.
const MESSAGES: Record<string, string> = {
  bungie_error: "Bungie declined the sign-in request. Please try again.",
  no_state: "Your sign-in link was missing security information. Start again from the home page.",
  no_code: "Bungie didn't return an authorization code. Please try signing in again.",
  state_mismatch: "Your sign-in session expired or didn't match. Please sign in again.",
  token_exchange_failed: "We couldn't complete sign-in with Bungie. Please try again in a moment.",
  token_fetch_threw: "We couldn't reach Bungie to finish sign-in. Please try again.",
  user_fetch_failed: "We couldn't load your Bungie profile. Please try again.",
  user_fetch_threw: "We couldn't reach Bungie to load your profile. Please try again.",
  no_destiny_membership: "No Destiny 2 account is linked to this Bungie profile.",
  encrypt_failed: "Something went wrong securing your session. Please try again.",
  database_unavailable: "The database is timing out right now. Please try again in a minute.",
  user_upsert_failed: "We couldn't save your account. Please try again.",
  account_upsert_failed: "We couldn't save your Bungie link. Please try again.",
  jwt_encode_failed: "Something went wrong creating your session. Please try again.",
};

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error && MESSAGES[error]) || "Something went wrong during sign-in.";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-red-400">Sign-in failed</h1>
      <p className="text-gray-400 max-w-md">{message}</p>
      {error && <p className="text-xs text-gray-600 font-mono">Code: {error}</p>}
      <Link
        href="/"
        className="mt-2 bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
      >
        Try signing in again
      </Link>
    </main>
  );
}
