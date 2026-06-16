import { NextResponse } from "next/server";
import { getStreams } from "@/lib/streams";
import type { League } from "@/lib/types";
import type { StreamLookup } from "@/lib/streams/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLeague(value: unknown): value is League {
  return value === "nba" || value === "ncaab" || value === "mlb" || value === "atp" || value === "wta";
}

function isTeam(value: unknown): value is StreamLookup["homeTeam"] {
  return isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.abbreviation === "string";
}

function isStreamLookup(value: unknown): value is StreamLookup {
  return isRecord(value) &&
    typeof value.id === "string" &&
    isLeague(value.league) &&
    isTeam(value.homeTeam) &&
    isTeam(value.awayTeam);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isStreamLookup(body)) {
    return NextResponse.json({ streams: [] }, { status: 400 });
  }

  const streams = await getStreams(body);
  return NextResponse.json({ streams });
}
