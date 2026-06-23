import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Gun Roulette",
  description: "Destiny 2 random loadout generator for you and your fireteam",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bungie-dark text-gray-100 antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
