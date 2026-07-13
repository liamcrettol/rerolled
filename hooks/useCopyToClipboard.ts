"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCopyToClipboard(resetAfterMs = 1500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopiedKey(null), resetAfterMs);
      return true;
    } catch {
      return false;
    }
  }, [resetAfterMs]);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  return {
    copy,
    isCopied: useCallback((key: string) => copiedKey === key, [copiedKey]),
  };
}
