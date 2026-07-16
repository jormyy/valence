import { NextResponse } from "next/server";
import { getEspnSummary } from "@/lib/espn";
import type { StatLeader, TeamStats } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let summary: Awaited<ReturnType<typeof getEspnSummary>>;
  try {
    summary = await getEspnSummary(id, { signal: request.signal });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    throw error;
  }

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
