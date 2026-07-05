/** @jest-environment node */
import {
  InMemoryScoreAttackJobQueue,
  runNextScoreAttackJob,
} from "@/lib/scoreAttack/worker/jobs";

describe("Score Attack worker jobs", () => {
  it("dedupes queued jobs by logical key", () => {
    const queue = new InMemoryScoreAttackJobQueue();
    const first = queue.enqueue({
      type: "fetch_pgcr",
      runId: "run-1",
      payload: { runId: "run-1", instanceId: "pgcr-1" },
    });
    const second = queue.enqueue({
      type: "fetch_pgcr",
      runId: "run-1",
      payload: { instanceId: "pgcr-1", runId: "run-1" },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(queue.all()).toHaveLength(1);
  });

  it("retries failed jobs with backoff and then completes them", async () => {
    const queue = new InMemoryScoreAttackJobQueue();
    queue.enqueue({
      type: "compute_score",
      runId: "run-1",
      payload: { runId: "run-1", playerMembershipId: "player-1" },
      maxAttempts: 2,
    });

    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);

    const first = await runNextScoreAttackJob(
      queue,
      { compute_score: handler },
      new Date("2026-07-05T18:00:00Z"),
      1_000
    );
    expect(first.status).toBe("failed");
    expect(first.job?.status).toBe("pending");
    expect(first.job?.attempts).toBe(1);
    expect(first.job?.runAt).toBe("2026-07-05T18:00:01.000Z");

    const idle = await runNextScoreAttackJob(
      queue,
      { compute_score: handler },
      new Date("2026-07-05T18:00:00.500Z"),
      1_000
    );
    expect(idle.status).toBe("idle");

    const second = await runNextScoreAttackJob(
      queue,
      { compute_score: handler },
      new Date("2026-07-05T18:00:01Z"),
      1_000
    );
    expect(second.status).toBe("completed");
    expect(second.job?.status).toBe("completed");
    expect(second.job?.attempts).toBe(2);
  });
});
