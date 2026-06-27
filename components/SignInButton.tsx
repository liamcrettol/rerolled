"use client";

export default function SignInButton() {
  return (
    // OAuth entry point — must be a full navigation to the API route, not a client-side <Link>.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/api/auth/bungie/login"
      className="w-full bg-bungie-blue hover:opacity-90 text-white font-semibold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
      </svg>
      Sign in with Bungie.net
    </a>
  );
}
