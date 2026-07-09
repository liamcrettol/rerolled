import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="section-label">Error 404</p>
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="text-gray-400 max-w-md">
        That page does not exist. If you followed a lobby invite, the code may have
        expired or the lobby has already ended.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Back to home
        </Link>
        <Link
          href="/dashboard"
          className="border border-bungie-border hover:border-bungie-blue text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
