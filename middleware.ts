import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest): NextResponse {
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-trace-id", traceId);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  res.headers.set("x-trace-id", traceId);
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
