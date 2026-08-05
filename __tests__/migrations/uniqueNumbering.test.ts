/** @jest-environment node */
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "../../supabase/migrations");

// Legacy accidental number collisions (#370) that predate this guard, already
// applied live. Not renaming them - would only create confusion about what's
// actually been run against the live DB with no benefit. New collisions must
// not join this list; use the NNNa/NNNb suffix convention (see 059a/059b)
// when two migrations land around the same time instead.
const GRANDFATHERED_COLLISIONS = new Set(["045", "046", "049", "050", "051"]);

it("does not introduce new duplicate migration numbers", () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const byNumber = new Map<string, string[]>();

  for (const file of files) {
    const match = file.match(/^(\d+)([a-z]?)_/);
    if (!match) continue;
    const [, number, suffix] = match;
    if (suffix) continue; // intentional NNNa/NNNb split, not a collision
    const list = byNumber.get(number) ?? [];
    list.push(file);
    byNumber.set(number, list);
  }

  const unexpectedCollisions = [...byNumber.entries()].filter(
    ([number, list]) => list.length > 1 && !GRANDFATHERED_COLLISIONS.has(number),
  );

  expect(unexpectedCollisions).toEqual([]);
});
