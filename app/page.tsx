import { getAllGames } from "@/lib/espn";
import { attachStreamCounts } from "@/lib/streams";
import App from "@/components/App";

export const revalidate = 60;

export default async function Home() {
  const games = await getAllGames();
  const gamesWithStreams = await attachStreamCounts(games);
  return <App initialGames={gamesWithStreams} />;
}
