"use client";

import { useEffect, useState } from "react";

export default function LocalDateTime({ value }: { value: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setFormatted(new Date(value).toLocaleString(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }));
  }, [value]);

  return <>{formatted ?? "—"}</>;
}
