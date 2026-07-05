"use client";

export default function SignInButton({ returnTo }: { returnTo?: string } = {}) {
  const href = returnTo
    ? `/api/auth/bungie/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/bungie/login";

  return (
    // OAuth entry point — must be a full navigation to the API route, not a client-side <Link>.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href={href}
      className="w-full bg-bungie-blue hover:bg-[#26bcf3] text-white text-sm font-bold uppercase tracking-wider py-3 px-6 transition-colors flex items-center justify-center gap-2"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
      </svg>
      Sign in with Bungie.net
    </a>
  );
}
