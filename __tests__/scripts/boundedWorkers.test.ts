/** @jest-environment node */
import { mapWithConcurrency } from "../../scripts/lib/boundedWorkers.mjs";

describe("mapWithConcurrency", () => {
  it("never exceeds the configured concurrency and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, index) => index);

    const results = await mapWithConcurrency(items, 4, async (item: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, item % 3));
      active--;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
    expect(results).toEqual(items.map((item) => item * 2));
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid concurrency %s",
    async (concurrency) => {
      await expect(mapWithConcurrency([1], concurrency, async (value: number) => value)).rejects.toThrow(/positive/);
    },
  );

  it("handles an empty page without starting workers", async () => {
    const worker = jest.fn();
    await expect(mapWithConcurrency([], 24, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
