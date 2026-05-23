import { NextResponse } from "next/server";
import { getAllGames } from "@/lib/espn";
import { getStreamCount } from "@/lib/streams";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;

  const games = await getAllGames(date);

  // Skip stream count fetches for non-today dates — streamed.pk only has today's events
  const streamCounts = date
    ? games.map(() => 0)
    : await Promise.all(games.map((g) => getStreamCount(g)));

  const gamesWithStreams = games.map((g, i) => ({ ...g, streamCount: streamCounts[i] }));
  return NextResponse.json({ games: gamesWithStreams });
}
