import { NextResponse } from "next/server";
import { getAllGames, normalizeEspnDateParam } from "@/lib/espn";
import { attachStreamCounts, prefetchStreamCounts } from "@/lib/streams";
import { leagueDisplayForGames } from "@/lib/registry";

export async function GET(request: Request) {
  const date = normalizeEspnDateParam(new URL(request.url).searchParams.get("date"));
  try {
    // Warm provider listings concurrently with the ESPN scoreboard fan-out.
    const warming = prefetchStreamCounts(date, { signal: request.signal });
    const games = await getAllGames(date, { signal: request.signal });
    await warming;
    const gamesWithStreams = await attachStreamCounts(games, date, { signal: request.signal });
    return NextResponse.json({
      games: gamesWithStreams,
      leagueDisplay: leagueDisplayForGames(gamesWithStreams),
    });
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    throw error;
  }
}
