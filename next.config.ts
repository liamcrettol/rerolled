import type { NextConfig } from "next";
import { withAxiom } from "next-axiom";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.bungie.net",
        pathname: "/common/destiny2_content/**",
      },
    ],
  },
};

export default withSentryConfig(withAxiom(nextConfig), {
  org: "rerolled",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
