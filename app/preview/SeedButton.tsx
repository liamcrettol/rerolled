"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SeedButton() {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const router = useRouter();

  async function seed() {
    setLoading(true);
    setStatus(null);
    setIsError(false);
    const res = await fetch("/api/dev/seed", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setIsError(true);
      setStatus(data.error);
    } else {
      setStatus(data.message ?? "Done");
    }
    setLoading(false);
    router.refresh();
  }

  async function clear() {
    setLoading(true);
    setStatus(null);
    setIsError(false);
    await fetch("/api/dev/seed", { method: "DELETE" });
    setStatus("Test data cleared.");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {status && (
        <span className={`text-sm ${isError ? "text-red-400" : "text-green-400"}`}>
          {status}
        </span>
      )}
      <button
        onClick={seed}
        disabled={loading}
        className="px-4 py-2 bg-bungie-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {loading ? "Working..." : "Seed Test Data"}
      </button>
      <button
        onClick={clear}
        disabled={loading}
        className="px-3 py-2 text-gray-400 text-sm border border-bungie-border hover:text-red-400 hover:border-red-800 disabled:opacity-50 transition"
      >
        Clear
      </button>
    </div>
  );
}
