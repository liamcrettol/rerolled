import Image from "next/image";

interface WeaponIconProps {
  icon: string;
  watermark?: string;
  name: string;
  size?: "small" | "medium" | "large";
  count?: number;
}

export default function WeaponIcon({ icon, watermark, name, size = "medium", count }: WeaponIconProps) {
  const sizeMap = {
    small: "w-6 h-6",
    medium: "w-9 h-9",
    large: "w-12 h-12",
  };

  return (
    <div className={`relative ${sizeMap[size]} shrink-0 rounded overflow-hidden bg-bungie-dark`}>
      <Image src={icon} alt={name} fill className="object-cover" />
      {watermark && <Image src={watermark} alt="" fill className="object-cover absolute inset-0" />}
      {count !== undefined && count > 1 && (
        <div className="absolute bottom-0 right-0 bg-bungie-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-tl">
          {count}×
        </div>
      )}
    </div>
  );
}
