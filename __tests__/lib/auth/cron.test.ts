/** @jest-environment node */
import { NextRequest } from "next/server";
import { assertCronAuth } from "@/lib/auth/cron";

function req(authHeader?: string) {
  return new NextRequest("https://test.app/api/cron/detect-games", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("assertCronAuth", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnv;
  });

  it("allows a request bearing the exact configured secret", () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    expect(assertCronAuth(req("Bearer correct-horse-battery-staple"))).toBeNull();
  });

  it("rejects a request with the wrong secret", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = assertCronAuth(req("Bearer wrong-secret"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  // Production health audit (2026-08-13): the compare used to be a plain
  // `!==` on the raw header string, a non-constant-time comparison on a
  // secret. Guard the constant-time path stays in place for secrets of
  // differing length too, since Buffer.from(...) with mismatched lengths
  // throws in timingSafeEqual if not short-circuited first.
  it("rejects a supplied secret of a different length without throwing", async () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = assertCronAuth(req("Bearer short"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("rejects a missing authorization header", () => {
    process.env.CRON_SECRET = "correct-horse-battery-staple";
    const res = assertCronAuth(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("fails closed in production when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL_ENV = "production";
    const res = assertCronAuth(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it("allows any caller outside production when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL_ENV = "preview";
    expect(assertCronAuth(req())).toBeNull();
  });
});
