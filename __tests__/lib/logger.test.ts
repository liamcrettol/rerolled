import { createLogger } from "@/lib/logger";
import { NextRequest } from "next/server";

// next-axiom's Logger calls out to Axiom — mock it so tests are offline-safe
jest.mock("next-axiom", () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    with: jest.fn().mockReturnThis(),
    flush: jest.fn(),
  })),
}));

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("https://example.com/api/test", {
    method: "POST",
    headers,
  });
}

describe("createLogger", () => {
  it("returns an object with info, warn, error, flush", () => {
    const req = makeRequest({ "x-trace-id": "abc-123" });
    const log = createLogger(req);
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.flush).toBe("function");
  });

  it("binds traceId from x-trace-id header", () => {
    const req = makeRequest({ "x-trace-id": "trace-xyz" });
    const log = createLogger(req);
    const { Logger } = require("next-axiom");
    const instance = Logger.mock.results[Logger.mock.results.length - 1].value;
    expect(instance.with).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: "trace-xyz" })
    );
  });

  it("binds path and method from the request", () => {
    const req = makeRequest({ "x-trace-id": "t1" });
    const log = createLogger(req);
    const { Logger } = require("next-axiom");
    const instance = Logger.mock.results[Logger.mock.results.length - 1].value;
    expect(instance.with).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/api/test", method: "POST" })
    );
  });

  it("binds userId when provided", () => {
    const req = makeRequest({ "x-trace-id": "t2" });
    const log = createLogger(req, "user-999");
    const { Logger } = require("next-axiom");
    const instance = Logger.mock.results[Logger.mock.results.length - 1].value;
    expect(instance.with).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-999" })
    );
  });

  it("omits userId when not provided", () => {
    const req = makeRequest({ "x-trace-id": "t3" });
    createLogger(req);
    const { Logger } = require("next-axiom");
    const instance = Logger.mock.results[Logger.mock.results.length - 1].value;
    const callArg = instance.with.mock.calls[instance.with.mock.calls.length - 1][0];
    expect(callArg).not.toHaveProperty("userId");
  });
});
