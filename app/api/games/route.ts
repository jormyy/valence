import { NextResponse } from "next/server";
import { getAllGames, normalizeEspnDateParam } from "@/lib/espn";
import { attachStreamCounts, prefetchStreamCounts } from "@/lib/streams";

export async function GET(request: Request) {
  const date = normalizeEspnDateParam(new URL(request.url).searchParams.get("date"));
  // Warm provider listings concurrently with the ESPN scoreboard fan-out.
  const warming = prefetchStreamCounts(date, { signal: request.signal });
  const games = await getAllGames(date, { signal: request.signal });
  await warming;
  const gamesWithStreams = await attachStreamCounts(games, date, { signal: request.signal });
  return NextResponse.json({ games: gamesWithStreams });
}
