import { NextResponse } from "next/server";
import { getStreams } from "@/lib/streams";
import { getAllGames } from "@/lib/espn";

export const revalidate = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const games = await getAllGames();
  const game = games.find((g) => g.id === id);

  if (!game) {
    return NextResponse.json({ streams: [] });
  }

  const streams = await getStreams(game);
  return NextResponse.json({ streams });
}
