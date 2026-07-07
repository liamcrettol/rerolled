import { redirect } from "next/navigation";

// Score Attack was removed as a user-facing mode (#295); Endgame Roulette
// took its home-grid slot. Redirect instead of 404 so old links/bookmarks
// land somewhere useful rather than a dead end.
export default function ScoreAttackPage() {
  redirect("/endgame");
}
