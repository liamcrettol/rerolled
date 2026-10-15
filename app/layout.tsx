import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import UpdateAvailable from "@/components/UpdateAvailable";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Archivo carries a width axis: normal for body, widened caps (.font-wide)
// for the Destiny-style weapon names and stage titles. Plex Mono is for codes.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

const DESCRIPTION =
  "Roll random Destiny 2 weapon loadouts from a shared fireteam pool, then equip and compare rolls together.";

// Invite links (/join/<code>, /lobby/<code>) redirect unauthenticated requests, so
// a crawler unfurling a shared invite only ever reaches the root document. These
// root-level tags are therefore the ones Discord actually renders. `metadataBase`
// resolves opengraph-image to the absolute URL unfurl crawlers require.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://rerolled.io"),
  title: {
    default: "Rerolled",
    template: "%s | Rerolled",
  },
  description: DESCRIPTION,
  applicationName: "Rerolled",
  // Private-group app: keep it out of search results. See app/robots.ts.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Rerolled",
    title: "Rerolled",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Rerolled",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-bungie-dark text-gray-100 antialiased">
        <Providers>{children}</Providers>
        <UpdateAvailable />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
