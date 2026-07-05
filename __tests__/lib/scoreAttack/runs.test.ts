/** @jest-environment node */
import { createRun, transitionRun } from "@/lib/scoreAttack/runs";

// Minimal chainable Supabase fake, configured per table. Chain methods return
// the builder; maybeSingle/single resolve configured rows; awaiting the builder
// (insert / update().eq()) resolves the table's terminal result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: Record<string, any>) {
  return {
    from(table: string) {
      const cfg = config[table] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        insert: () => builder,
        update: () => builder,
        maybeSingle: async () => cfg.maybeSingle ?? { data: null, error: null },
        single: async () => cfg.single ?? { data: null, error: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: any) => resolve(cfg.terminal ?? { error: null }),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const owner = { userId: "u1", bungieMembershipId: "m1", bungieMembershipType: 3 };
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("createRun", () => {
  it("creates a score_attack run without touching weekly challenges", async () => {
    const db = makeDb({ challenge_runs: { single: { data: { id: "r1", status: "created" }, error: null } } });
    const res = await createRun({ ...owner, mode: "score_attack" }, db);
    expect(res).toMatchObject({ ok: true, runId: "r1", status: "created" });
  });

  it("creates a weekly run inside the challenge window", async () => {
    const db = makeDb({
      weekly_challenges: { maybeSingle: { data: { id: "wc1", status: "active", ends_at: future, season_id: "s1" } } },
      challenge_runs: { single: { data: { id: "r2", status: "created" }, error: null } },
    });
    const res = await createRun({ ...owner, mode: "weekly_challenge", weeklyChallengeId: "wc1" }, db);
    expect(res.ok).toBe(true);
  });

  it("requires a weeklyChallengeId for weekly runs", async () => {
    const res = await createRun({ ...owner, mode: "weekly_challenge" }, makeDb({}));
    expect(res).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("rejects a run for an ended weekly challenge (#251)", async () => {
    const db = makeDb({
      weekly_challenges: { maybeSingle: { data: { id: "wc1", status: "active", ends_at: past, season_id: "s1" } } },
    });
    const res = await createRun({ ...owner, mode: "weekly_challenge", weeklyChallengeId: "wc1" }, db);
    expect(res).toMatchObject({ ok: false, httpStatus: 409 });
    expect(res.error).toMatch(/ended/i);
  });

  it("rejects a run for an inactive weekly challenge", async () => {
    const db = makeDb({
      weekly_challenges: { maybeSingle: { data: { id: "wc1", status: "draft", ends_at: future, season_id: "s1" } } },
    });
    const res = await createRun({ ...owner, mode: "weekly_challenge", weeklyChallengeId: "wc1" }, db);
    expect(res).toMatchObject({ ok: false, httpStatus: 409 });
  });
});

describe("transitionRun", () => {
  const runRow = (status: string, created_by = "u1") => ({
    challenge_runs: { maybeSingle: { data: { id: "r1", status, created_by } } },
  });

  it("applies a legal client transition", async () => {
    const res = await transitionRun({ runId: "r1", userId: "u1", next: "loadout_rolled" }, makeDb(runRow("created")));
    expect(res).toMatchObject({ ok: true, status: "loadout_rolled" });
  });

  it("rejects a transition on a run the caller does not own", async () => {
    const res = await transitionRun({ runId: "r1", userId: "u1", next: "loadout_rolled" }, makeDb(runRow("created", "someone-else")));
    expect(res).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it("rejects an illegal transition", async () => {
    // created can only go to loadout_rolled/abandoned/expired, not applied.
    const res = await transitionRun({ runId: "r1", userId: "u1", next: "applied" }, makeDb(runRow("created")));
    expect(res).toMatchObject({ ok: false, httpStatus: 400 });
    expect(res.error).toMatch(/invalid_transition/);
  });

  it("blocks a client from claiming a worker-owned result state", async () => {
    const res = await transitionRun({ runId: "r1", userId: "u1", next: "scored" }, makeDb(runRow("parsed")));
    expect(res).toMatchObject({ ok: false, httpStatus: 400 });
    expect(res.error).toMatch(/trusted_worker_state_required/);
  });

  it("404s when the run does not exist", async () => {
    const res = await transitionRun({ runId: "nope", userId: "u1", next: "loadout_rolled" }, makeDb({}));
    expect(res).toMatchObject({ ok: false, httpStatus: 404 });
  });
});
