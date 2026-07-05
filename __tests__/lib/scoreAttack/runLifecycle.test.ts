/** @jest-environment node */
import { canTransitionScoreAttackRunState } from "@/lib/scoreAttack/runLifecycle";

describe("Score Attack run lifecycle", () => {
  it("allows the expected server-side progression", () => {
    expect(
      canTransitionScoreAttackRunState({
        current: "created",
        next: "loadout_rolled",
        actor: "server",
      })
    ).toEqual({ ok: true, next: "loadout_rolled" });

    expect(
      canTransitionScoreAttackRunState({
        current: "parsed",
        next: "scored",
        actor: "worker",
      })
    ).toEqual({ ok: true, next: "scored" });
  });

  it("does not let client input mark trusted result states", () => {
    expect(
      canTransitionScoreAttackRunState({
        current: "parsed",
        next: "scored",
        actor: "client",
      })
    ).toMatchObject({
      ok: false,
      next: "parsed",
      reason: "trusted_worker_state_required",
    });
  });

  it("blocks transitions out of terminal states", () => {
    expect(
      canTransitionScoreAttackRunState({
        current: "finalized",
        next: "failed",
        actor: "worker",
      })
    ).toMatchObject({
      ok: false,
      next: "finalized",
      reason: "terminal_state",
    });
  });
});
