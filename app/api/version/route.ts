import { NextResponse } from "next/server";

// Prerendered at build time, NOT per request. The whole point of this endpoint
// is to identify the deployment serving it, and that value is fixed the moment
// the deployment is built - there was never anything dynamic to compute. As
// `force-dynamic` it was a serverless invocation on every check, from every
// tab, on every page, forever, because UpdateAvailable is mounted in the root
// layout. As a static asset it is a CDN hit costing zero function time, and
// clients still learn about a new version because the production alias points
// at the new deployment's copy of this file.
export const dynamic = "force-static";

export function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    "development";

  return NextResponse.json(
    { version },
    {
      headers: {
        // Short edge TTL so a promotion is picked up quickly, with SWR so a
        // revalidation never blocks a client.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
