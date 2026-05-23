import { getAllGames } from "@/lib/espn";
import { attachStreamCounts } from "@/lib/streams";
import App from "@/components/App";

export const revalidate = 60;

export default async function Home() {
  const games = await getAllGames();
  if (games.length === 0) {
    return <div className="empty-page">No games scheduled today.</div>;
  }
  const gamesWithStreams = await attachStreamCounts(games);
  return <App initialGames={gamesWithStreams} />;
}
