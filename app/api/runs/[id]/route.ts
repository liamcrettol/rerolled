import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";

// Run status for the run-flow UI (#246). Owner-only; the client polls this
// after applying to follow the worker pipeline (detect → PGCR → score) and to
// render the final score breakdown.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const { data: run } = await adminSupabase
      .from("challenge_runs")
      .select(
        "id, mode, status, created_by, weekly_challenge_id, score, scoring_breakdown, compliance_status, started_at, completed_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.created_by !== session.userId) {
      return NextResponse.json({ error: "You do not own this run." }, { status: 403 });
    }

    const { data: slots } = await adminSupabase
      .from("challenge_run_loadout_slots")
      .select("slot, item_hash, weapon_name, weapon_icon, weapon_type, damage_type, reroll_count")
      .eq("run_id", id);

    return NextResponse.json({
      run: {
        id: run.id,
        mode: run.mode,
        status: run.status,
        weeklyChallengeId: run.weekly_challenge_id,
        score: run.score !== null ? Number(run.score) : null,
        scoringBreakdown: run.scoring_breakdown ?? null,
        complianceStatus: run.compliance_status ?? null,
        startedAt: run.started_at,
        completedAt: run.completed_at,
      },
      loadout: (slots ?? []).map((s) => ({
        slot: s.slot,
        itemHash: s.item_hash,
        name: s.weapon_name,
        icon: s.weapon_icon,
        weaponType: s.weapon_type,
        damageType: s.damage_type,
        rerollCount: s.reroll_count,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
