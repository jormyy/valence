import { NextResponse } from "next/server";
import { getEspnSummary } from "@/lib/espn";
import type { StatLeader, TeamStats } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const summary = await getEspnSummary(id);

  if (!summary) return NextResponse.json({ leaders: [] });

  const teamStats: TeamStats[] = (summary.leaders ?? [])
    .map((t): TeamStats => ({
      teamName: t.team?.displayName ?? "Unknown",
      leaders: (t.leaders ?? []).flatMap((cat): StatLeader[] =>
        (cat.leaders ?? []).slice(0, 1).map((l): StatLeader => ({
          athlete: l.athlete?.displayName ?? "Unknown",
          value: l.displayValue ?? "",
          category: cat.displayName ?? "",
        }))
      ),
    }))
    .filter((t) => t.leaders.length > 0);

  return NextResponse.json({ leaders: teamStats });
}
