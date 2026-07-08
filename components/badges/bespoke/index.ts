import type { ComponentType } from "react";
import Immaculate from "@/components/badges/bespoke/Immaculate";
import Invict from "@/components/badges/bespoke/Invict";
import InvictMark from "@/components/badges/bespoke/InvictMark";

export const BESPOKE_BADGES: Record<string, ComponentType> = {
  trials_lighthouse_writ: Immaculate,
  status_invict: Invict,
};

export const BESPOKE_BADGE_MARKS: Record<string, ComponentType> = {
  status_invict: InvictMark,
};
