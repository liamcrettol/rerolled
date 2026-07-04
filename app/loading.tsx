import RouletteLoader from "@/components/RouletteLoader";

// Fallback loading state for any route without its own loading.tsx.
export default function Loading() {
  return <RouletteLoader label="Loading…" />;
}
