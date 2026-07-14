// Small strict argument parser shared by the PGCR archive CLIs.
// Safety matters more than convenience here: a misspelled --dry-run or an
// invalid --limit must stop the process, never broaden it into a live or
// unbounded operation.

export class CliArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliArgumentError";
  }
}

/**
 * @typedef {{ key: string, type: "boolean" | "positiveInteger" | "nonEmptyString" }} OptionDefinition
 */

/**
 * @param {string[]} argv
 * @param {Record<string, OptionDefinition>} definitions
 * @param {Record<string, unknown>} defaults
 */
export function parseStrictArgs(argv, definitions, defaults = {}) {
  const result = { ...defaults };
  const seen = new Set();

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const definition = definitions[flag];
    if (!definition) {
      throw new CliArgumentError(`Unknown option: ${flag}`);
    }
    if (seen.has(flag)) {
      throw new CliArgumentError(`Option may only be provided once: ${flag}`);
    }
    seen.add(flag);

    if (definition.type === "boolean") {
      result[definition.key] = true;
      continue;
    }

    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new CliArgumentError(`Missing value for ${flag}`);
    }

    if (definition.type === "positiveInteger") {
      if (!/^\d+$/.test(value)) {
        throw new CliArgumentError(`${flag} must be a positive integer`);
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new CliArgumentError(`${flag} must be a positive safe integer`);
      }
      result[definition.key] = parsed;
      continue;
    }

    if (definition.type === "nonEmptyString") {
      if (value.trim().length === 0) {
        throw new CliArgumentError(`${flag} requires a non-empty value`);
      }
      result[definition.key] = value;
      continue;
    }

    throw new CliArgumentError(`Unsupported option type for ${flag}`);
  }

  return result;
}
