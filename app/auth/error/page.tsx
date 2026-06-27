import Link from "next/link";

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-red-400">Sign-in failed</h1>
      <p className="text-gray-400">{params.error ?? "Unknown error"}</p>
      <Link href="/" className="text-bungie-blue hover:underline">
        Back to home
      </Link>
    </main>
  );
}
