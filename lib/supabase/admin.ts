import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service role client - only used server-side, never exposed to browser.
//
// Instantiated lazily: creating the client at module load made `next build`
// fail while "Collecting page data", because route modules are imported (and
// this ran) before env vars are guaranteed to be present in the build env
// (e.g. SUPABASE_SERVICE_ROLE_KEY is absent on Preview deployments). The Proxy
// defers createClient() to the first real property access at request time, so
// importing a route no longer requires the service-role secret at build time.
let client: SupabaseClient | null = null;
const SUPABASE_REQUEST_TIMEOUT_MS = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? 1_200);

function timedFetch(input: string | URL | Request, init?: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: timedFetch },
      }
    );
  }
  return client;
}

export async function withSupabaseTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Supabase query timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export const adminSupabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getClient();
    const value = Reflect.get(c, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
