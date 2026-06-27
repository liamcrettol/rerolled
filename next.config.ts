import type { NextConfig } from "next";
import { withAxiom } from "next-axiom";

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

export default withAxiom(nextConfig);
