import type { MetadataRoute } from "next";

// Rerolled is a private-group app, not a public product. Keep it out of search
// indexes. Link-unfurl crawlers (Discord, where invites actually get shared) do
// not consult robots.txt, so lobby links still preview correctly.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
