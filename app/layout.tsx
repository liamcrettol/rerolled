import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/components/Providers";
import UpdateAvailable from "@/components/UpdateAvailable";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const archivo = localFont({src: [{path: "./fonts/archivo-400.ttf", weight: "400"}, {path: "./fonts/archivo-500.ttf", weight: "500"}, {path: "./fonts/archivo-600.ttf", weight: "600"}], variable: "--font-archivo", display: "swap"});
const themeScript = `(function(){var s;try{s=localStorage.getItem('mida-theme')}catch(e){}document.documentElement.dataset.theme=s==='light'||s==='dark'?s:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()`;

const DESCRIPTION =
  "Roll random Destiny 2 weapon loadouts from a shared fireteam pool, then equip and compare rolls together.";

// Invite links (/join/<code>, /lobby/<code>) redirect unauthenticated requests, so
// a crawler unfurling a shared invite only ever reaches the root document. These
// root-level tags are therefore the ones Discord actually renders. `metadataBase`
// resolves opengraph-image to the absolute URL unfurl crawlers require.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://rerolled.mida.tools"),
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
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen bg-bungie-dark text-gray-100 antialiased">
        <a className="mida-skip" href="#mida-content">Skip to content</a><div id="mida-content"><Providers>{children}</Providers></div>
        <UpdateAvailable />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
