import { NextResponse } from "next/server";
import { getAllGames, normalizeEspnDateParam } from "@/lib/espn";
import { attachStreamCounts } from "@/lib/streams";

export async function GET(request: Request) {
  const date = normalizeEspnDateParam(new URL(request.url).searchParams.get("date"));
  const games = await getAllGames(date, { signal: request.signal });
  const gamesWithStreams = await attachStreamCounts(games, date, { signal: request.signal });
  return NextResponse.json({ games: gamesWithStreams });
}
