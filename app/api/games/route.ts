import { NextResponse } from "next/server";
import { getAllGames } from "@/lib/espn";
import { attachStreamCounts } from "@/lib/streams";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  const games = await getAllGames(date);
  const gamesWithStreams = await attachStreamCounts(games, date);
  return NextResponse.json({ games: gamesWithStreams });
}
