/** @jest-environment node */
// Parked users drop out of the due queue, so green cron runs can hide users
// whose Crucible history has silently stopped syncing (#343). The cron reports
// every currently-parked user on every run via listParkedCrucibleSyncs.
jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

import { listParkedCrucibleSyncs } from "@/lib/crucible/sync";

type Row = Record<string, unknown>;

function makeDb(config: { parked: Row[]; users?: Row[]; usersError?: boolean }) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: async () => ({ data: config.parked, error: null }),
        in: async () => {
          if (config.usersError) throw new Error("users lookup exploded");
          return { data: config.users ?? [], error: null };
        },
      };
      if (table === "users") {
        return {
          select: () => ({
            in: builder.in,
          }),
        };
      }
      return builder;
    },
  };
}

describe("listParkedCrucibleSyncs", () => {
  it("returns every parked user with display names resolved", async () => {
    const db = makeDb({
      parked: [
        { user_id: "u1", last_error: "cross-app", updated_at: "2026-07-10T22:00:00Z" },
        { user_id: "u2", last_error: "dead token", updated_at: "2026-07-10T20:00:00Z" },
      ],
      users: [
        { id: "u1", display_name: "Tico#5728" },
        { id: "u2", display_name: null },
      ],
    });

    const parked = await listParkedCrucibleSyncs(db);
    expect(parked).toEqual([
      { userId: "u1", displayName: "Tico#5728", error: "cross-app", parkedAt: "2026-07-10T22:00:00Z" },
      { userId: "u2", displayName: null, error: "dead token", parkedAt: "2026-07-10T20:00:00Z" },
    ]);
  });

  it("returns an empty list when nobody is parked, without touching users", async () => {
    const db = makeDb({ parked: [], usersError: true });
    await expect(listParkedCrucibleSyncs(db)).resolves.toEqual([]);
  });

  it("falls back to ids when the display-name lookup fails", async () => {
    const db = makeDb({
      parked: [{ user_id: "u1", last_error: "cross-app", updated_at: null }],
      usersError: true,
    });

    const parked = await listParkedCrucibleSyncs(db);
    expect(parked).toEqual([
      { userId: "u1", displayName: null, error: "cross-app", parkedAt: null },
    ]);
  });
});
