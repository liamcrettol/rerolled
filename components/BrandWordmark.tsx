export default function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span className="text-[#1d4ed8]">Re</span>
      <span className="text-white">rolled</span>
    </span>
  );
}
