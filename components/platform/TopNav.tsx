"use client";
import MidaHeader from "@/components/MidaHeader";
import SignOutButton from "@/components/SignOutButton";
export default function TopNav({displayName}: {displayName?: string; emblemPath?: string | null; emblemBackgroundPath?: string | null; clanName?: string | null}) {
  return <MidaHeader tool="rerolled" href="/dashboard"><a href="https://rival.mida.tools" className="inline-flex min-h-11 items-center">Rival</a>{displayName && <><span className="max-w-[160px] truncate">{displayName.split("#")[0]}</span><SignOutButton /></>}</MidaHeader>;
}
