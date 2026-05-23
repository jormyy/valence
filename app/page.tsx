import { getAllGames } from "@/lib/espn";
import { getStreamCount } from "@/lib/streams";
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

  const streamCounts = await Promise.all(games.map((g) => getStreamCount(g)));
  const gamesWithStreams = games.map((g, i) => ({
    ...g,
    streamCount: streamCounts[i],
  }));

  return <GameFeed games={gamesWithStreams} />;
}
