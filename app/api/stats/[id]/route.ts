import { NextResponse } from "next/server";
import { getEspnSummary } from "@/lib/espn";

interface StatLeader {
  athlete: string;
  value: string;
  category: string;
}

interface TeamStats {
  teamName: string;
  leaders: StatLeader[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const summary = await getEspnSummary(id);

  if (!summary) return NextResponse.json({ leaders: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawLeaders = (summary as any).leaders ?? [];
  const teamStats: TeamStats[] = rawLeaders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((teamLeader: any): TeamStats => ({
      teamName: teamLeader.team?.displayName ?? "Unknown",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      leaders: (teamLeader.leaders ?? []).flatMap((cat: any): StatLeader[] =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cat.leaders ?? []).slice(0, 1).map((l: any): StatLeader => ({
          athlete: l.athlete?.displayName ?? "Unknown",
          value: l.displayValue ?? "",
          category: cat.displayName ?? "",
        }))
      ),
    }))
    .filter((t: TeamStats) => t.leaders.length > 0);

  return NextResponse.json({ leaders: teamStats });
}
