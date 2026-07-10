import type { ComponentType } from "react";
import Developer from "@/components/badges/bespoke/Developer";
import DeveloperMark from "@/components/badges/bespoke/DeveloperMark";
import Immaculate from "@/components/badges/bespoke/Immaculate";
import Invict from "@/components/badges/bespoke/Invict";
import InvictMark from "@/components/badges/bespoke/InvictMark";

export const BESPOKE_BADGES: Record<string, ComponentType> = {
  trials_lighthouse_writ: Immaculate,
  status_developer: Developer,
  status_invict: Invict,
};

export const BESPOKE_BADGE_MARKS: Record<string, ComponentType> = {
  status_developer: DeveloperMark,
  status_invict: InvictMark,
};
