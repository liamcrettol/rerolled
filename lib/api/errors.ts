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
