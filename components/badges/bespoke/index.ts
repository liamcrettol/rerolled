// Bespoke badge override registry (#309) — keyed by badge slug (stable, does
// not change if the display name is renamed). BadgeChip checks this first
// and renders the hand-drawn design in place of the generic motif frame when
// a slug has an entry. Only viable at BadgeChip's "full" size (160x48
// viewBox) — bespoke art isn't built for the compact/tiny/icon aspect
// ratios, so those sizes fall back to the generic frame regardless.

import type { ComponentType } from "react";
import Immaculate from "@/components/badges/bespoke/Immaculate";
import Invict from "@/components/badges/bespoke/Invict";

export const BESPOKE_BADGES: Record<string, ComponentType> = {
  trials_lighthouse_writ: Immaculate,
  status_invict: Invict,
};
