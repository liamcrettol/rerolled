"use client";
export default function SignInButton({returnTo}: {returnTo?: string} = {}) {
  const href = returnTo ? `/api/auth/bungie/login?returnTo=${encodeURIComponent(returnTo)}` : "/api/auth/bungie/login";
  return <a href={href} className="mida-action">Sign in with Bungie</a>;
}
