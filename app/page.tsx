import { getAllGames } from "@/lib/espn";
import { attachStreamCounts, prefetchStreamCounts } from "@/lib/streams";
import App from "@/components/App";
import { leagueDisplayForGames } from "@/lib/registry";

export const revalidate = 60;

export default async function Home() {
  // Warm provider listings concurrently with the ESPN scoreboard fan-out.
  const warming = prefetchStreamCounts();
  const games = await getAllGames();
  await warming;
  const gamesWithStreams = await attachStreamCounts(games);
  return (
    <App
      initialGames={gamesWithStreams}
      initialLeagueDisplay={leagueDisplayForGames(gamesWithStreams)}
    />
  );
}
