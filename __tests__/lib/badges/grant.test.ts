/** @jest-environment node */
import { grantBadge } from "@/lib/badges/grant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let badgeResult: any = { data: null, error: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upsertResult: any = { error: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upserted: any = null;

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(badgeResult),
        upsert: (row: unknown) => {
          upserted = row;
          void table;
          return Promise.resolve(upsertResult);
        },
      };
      return builder;
    },
  },
}));

describe("grantBadge", () => {
  afterEach(() => {
    badgeResult = { data: null, error: null };
    upsertResult = { error: null };
    upserted = null;
  });

  it("refuses to grant a badge that isn't marked manual_grant", async () => {
    badgeResult = { data: { id: "b1", is_active: true, criteria: { rule: "first_valid_run" } }, error: null };
    const result = await grantBadge("user1", "core_drawn");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a manual-grant badge/);
    expect(upserted).toBeNull();
  });

  it("refuses an inactive badge", async () => {
    badgeResult = { data: { id: "b1", is_active: false, criteria: { rule: "manual_grant" } }, error: null };
    const result = await grantBadge("user1", "status_founder");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not active/);
  });

  it("errors clearly when the slug doesn't exist", async () => {
    badgeResult = { data: null, error: null };
    const result = await grantBadge("user1", "nonexistent");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No badge with slug/);
  });

  it("grants a manual_grant badge and upserts idempotently on user_id,badge_id,scope_key", async () => {
    badgeResult = { data: { id: "b1", is_active: true, criteria: { rule: "manual_grant" } }, error: null };
    const result = await grantBadge("user1", "status_founder");
    expect(result.ok).toBe(true);
    expect(upserted).toMatchObject({ user_id: "user1", badge_id: "b1", scope_key: "once" });
  });
});
