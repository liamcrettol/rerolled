import Link from "next/link";
import type { Metadata } from "next";

// Root layout applies the "%s | Rerolled" title template.
export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen flex justify-center p-8">
      <div className="panel p-8 max-w-2xl w-full h-fit mt-16 text-gray-300 leading-relaxed">
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500 mb-6">Last updated: July 2, 2026</p>

        <p className="mb-4">
          Rerolled is a free tool for Destiny 2 fireteams. This policy explains what data
          we collect and why.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6 mb-2">What we collect</h2>
        <ul className="list-disc list-inside space-y-2 mb-4">
          <li>
            <span className="font-medium text-gray-200">Bungie account data.</span> When you
            sign in with Bungie, we store your Bungie membership ID, display name, and an
            encrypted OAuth access/refresh token. We use this to read your character
            inventory and equip weapons on your account during a roulette round.
          </li>
          <li>
            <span className="font-medium text-gray-200">Lobby and match data.</span> Lobby
            codes, who joined, which weapons were rolled, and applied loadout results are
            stored so the app can sync your fireteam in real time and show roll history.
          </li>
          <li>
            <span className="font-medium text-gray-200">Usage analytics.</span> We use Vercel
            Analytics and Speed Insights to see aggregate traffic and performance data. These
            don&apos;t use tracking cookies or sell data to third parties.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6 mb-2">How it&apos;s stored</h2>
        <p className="mb-4">
          Data is stored in our Supabase database. OAuth tokens are encrypted at rest
          (AES-256-GCM) and are only decrypted server-side to call the Bungie API on your
          behalf. We never see or store your Bungie password.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6 mb-2">Third parties</h2>
        <p className="mb-4">
          We share data with the{" "}
          <a
            href="https://www.bungie.net/7/en/Legal/PrivacyPolicy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bungie-blue hover:underline"
          >
            Bungie API
          </a>{" "}
          (to read/equip inventory), Supabase (database hosting), and Vercel (app hosting,
          analytics). We don&apos;t sell your data or share it with advertisers.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6 mb-2">Your data</h2>
        <p className="mb-4">
          You can revoke Rerolled&apos;s access at any time from your{" "}
          <a
            href="https://www.bungie.net/7/en/User/Account/IdentityAuthorizations"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bungie-blue hover:underline"
          >
            Bungie account settings
          </a>
          . To request deletion of your account data from our database, contact us below.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6 mb-2">Contact</h2>
        <p className="mb-2">
          Questions about this policy or your data? Reach out on{" "}
          <a
            href="https://github.com/liamcrettol/rerolled/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bungie-blue hover:underline"
          >
            GitHub
          </a>
          .
        </p>

        <Link href="/" className="inline-block mt-8 text-sm text-gray-500 hover:text-gray-300">
          &larr; Back home
        </Link>
      </div>
    </main>
  );
}
