import { adminSupabase } from "@/lib/supabase/admin";

export const FREE_TIER_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;
export const DATABASE_WARNING_BYTES = Math.floor(FREE_TIER_DATABASE_LIMIT_BYTES * 0.8);

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
        `[database-capacity] WARNING ${context}: ${usedMb} MB used, at or above the 400 MB free-tier warning threshold`
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
