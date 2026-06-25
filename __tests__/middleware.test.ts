import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

describe("middleware", () => {
  it("adds x-trace-id header to requests that have none", () => {
    const req = new NextRequest("https://example.com/api/lobby/create", {
      method: "POST",
    });
    const res = middleware(req);
    expect(res.headers.get("x-trace-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("preserves existing x-trace-id on the response", () => {
    const req = new NextRequest("https://example.com/api/lobby/create", {
      method: "POST",
      headers: { "x-trace-id": "550e8400-e29b-41d4-a716-446655440000" },
    });
    const res = middleware(req);
    expect(res.headers.get("x-trace-id")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("response x-trace-id matches the forwarded request header value", () => {
    const req = new NextRequest("https://example.com/api/roulette/roll", {
      method: "POST",
    });
    const res = middleware(req);
    const responseTraceId = res.headers.get("x-trace-id");
    expect(responseTraceId).toBeTruthy();
    expect(responseTraceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
