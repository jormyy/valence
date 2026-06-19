import { NextResponse } from "next/server";
import { getStreams } from "@/lib/streams";
import { isLeague } from "@/lib/metadata";
import type { StreamLookup } from "@/lib/streams/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
    (value.eventName === undefined || typeof value.eventName === "string") &&
    (value.shortName === undefined || typeof value.shortName === "string") &&
    isTeam(value.homeTeam) &&
    isTeam(value.awayTeam);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isStreamLookup(body)) {
    return NextResponse.json({ streams: [] }, { status: 400 });
  }

  const streams = await getStreams(body, { signal: request.signal });
  return NextResponse.json({ streams });
}
