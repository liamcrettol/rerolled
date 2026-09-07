export function isDatabaseUnavailableError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const text = message.toLowerCase();
  return (
    text.includes("abort") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("fetch failed") ||
    text.includes("connection timed out") ||
    text.includes("cloudflare") ||
    text.includes("522")
  );
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  "This needs the database, and Supabase is timing out right now. Please try again in a minute.";

export const UNEXPECTED_ERROR_MESSAGE = "Something went wrong. Please try again.";

// A caught error's message is only safe to hand back to the client when the
// route itself chose the status code for it (e.g. mapping "Unauthorized" to
// 401, "Lobby not found" to 404) - those strings were deliberately written
// as user-facing. A 500 means the error was NOT recognized/mapped, so it's
// whatever the underlying failure happened to say (a raw Supabase/Postgres
// error, a Zod validation dump, etc.) and must not reach the client (#407).
export function toClientErrorMessage(message: string, status: number): string {
  return status === 500 ? UNEXPECTED_ERROR_MESSAGE : message;
}
