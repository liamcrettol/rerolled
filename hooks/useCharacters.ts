"use client";

import { useCallback, useEffect, useState } from "react";
import type { DestinyCharacter } from "@/types/bungie";

interface Options {
  enabled?: boolean;
  initialCharacterId?: string | null;
  selectFirst?: boolean;
}

export function useCharacters({
  enabled = true,
  initialCharacterId = null,
  selectFirst = true,
}: Options = {}) {
  const [characters, setCharacters] = useState<DestinyCharacter[] | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(initialCharacterId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/bungie/characters")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
        return (data.characters ?? []) as DestinyCharacter[];
      })
      .then((nextCharacters) => {
        if (cancelled) return;
        setCharacters(nextCharacters);
        if (nextCharacters.length === 0) {
          setError("No Destiny characters were returned. Retry before applying the loadout.");
        }
        setSelectedCharacterId((current) => {
          if (current && nextCharacters.some((character) => character.characterId === current)) return current;
          if (initialCharacterId && nextCharacters.some((character) => character.characterId === initialCharacterId)) {
            return initialCharacterId;
          }
          return selectFirst ? nextCharacters[0]?.characterId ?? null : null;
        });
      })
      .catch((reason) => {
        if (cancelled) return;
        setCharacters([]);
        setError(reason instanceof Error ? reason.message : "Couldn't load your Destiny characters");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, initialCharacterId, requestVersion, selectFirst]);

  return {
    characters,
    selectedCharacterId,
    setSelectedCharacterId,
    loading,
    error,
    retry,
  };
}
