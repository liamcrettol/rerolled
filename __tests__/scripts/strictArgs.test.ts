/** @jest-environment node */
import { CliArgumentError, parseStrictArgs } from "../../scripts/lib/strictArgs.mjs";

const definitions = {
  "--dry-run": { key: "dryRun", type: "boolean" as const },
  "--limit": { key: "limit", type: "positiveInteger" as const },
  "--after": { key: "after", type: "nonEmptyString" as const },
};

describe("parseStrictArgs", () => {
  it("rejects a misspelled --dry-run instead of permitting a live run", () => {
    expect(() => parseStrictArgs(["--dryrun"], definitions)).toThrow(CliArgumentError);
  });

  it.each(["0", "-1", "1.5", "NaN", "Infinity"])("rejects unsafe positive-integer value %s", (value) => {
    expect(() => parseStrictArgs(["--limit", value], definitions)).toThrow(/positive/);
  });

  it("rejects a missing option value", () => {
    expect(() => parseStrictArgs(["--limit"], definitions)).toThrow(/Missing value/);
    expect(() => parseStrictArgs(["--limit", "--dry-run"], definitions)).toThrow(/Missing value/);
  });

  it("rejects duplicate options", () => {
    expect(() => parseStrictArgs(["--dry-run", "--dry-run"], definitions)).toThrow(/only be provided once/);
  });

  it("parses valid values without broadening defaults", () => {
    expect(
      parseStrictArgs(["--dry-run", "--limit", "25", "--after", "123"], definitions, {
        dryRun: false,
        limit: null,
        after: null,
      }),
    ).toEqual({ dryRun: true, limit: 25, after: "123" });
  });
});
