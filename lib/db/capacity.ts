import { adminSupabase } from "@/lib/supabase/admin";

// Supabase Pro (both projects moved onto it 2026-07-21) includes 8 GB of disk
// before it auto-scales and bills per additional GB, so the old 500 MB free-tier
// ceiling no longer applies. Warn at 80% of the included disk, which is the point
// where growth starts costing money rather than the point where writes fail.
export const INCLUDED_DATABASE_BYTES = 8 * 1024 * 1024 * 1024;
export const DATABASE_WARNING_BYTES = Math.floor(INCLUDED_DATABASE_BYTES * 0.8);

export async function checkDatabaseCapacity(context: string): Promise<number | null> {
  try {
    const { data, error } = await adminSupabase.rpc("database_size_bytes");
    if (error) {
      console.error(`[database-capacity] ${context}: size check failed`, error.message);
      return null;
    }

    const bytes = Number(data);
    if (!Number.isFinite(bytes)) {
      console.error(`[database-capacity] ${context}: invalid size result`, data);
      return null;
    }

    if (bytes >= DATABASE_WARNING_BYTES) {
      const usedMb = Math.round(bytes / 1024 / 1024);
      console.error(
        `[database-capacity] WARNING ${context}: ${usedMb} MB used, at or above 80% of the 8 GB included with Supabase Pro`
      );
    }

    return bytes;
  } catch (error) {
    console.error(
      `[database-capacity] ${context}: size check threw`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
