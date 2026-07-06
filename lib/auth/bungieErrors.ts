export const BUNGIE_REAUTH_MESSAGE = "Bungie sign-in expired. Please sign out and sign in again.";

export function isBungieAuthErrorMessage(msg: string): boolean {
  return (
    msg === "Unauthorized" ||
    msg === "No Bungie account found for user" ||
    msg === "Bungie token expired. Please sign in again" ||
    msg === BUNGIE_REAUTH_MESSAGE ||
    msg.startsWith("Bungie token refresh failed (")
  );
}
