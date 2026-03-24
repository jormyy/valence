import { getAllGames } from "@/lib/espn";
import { getStreams } from "@/lib/streams";
import GameFeed from "@/components/GameFeed";

export const revalidate = 60;

export default async function Home() {
  const games = await getAllGames();

  if (games.length === 0) {
    return (
      <div className="py-20 text-center text-white/40">
        No games scheduled today.
      </div>
    );
  }

  const gamesWithStreams = games.map((g) => ({
    ...g,
    streamCount: getStreams(g.id).length,
  }));

  return <GameFeed games={gamesWithStreams} />;
}
