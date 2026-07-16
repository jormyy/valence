import { getAllGames } from "@/lib/espn";
import { attachStreamCounts, prefetchStreamCounts } from "@/lib/streams";
import App from "@/components/App";
import { leagueDisplayForGames } from "@/lib/registry";

// The shell is a build snapshot; App refreshes today's data immediately after hydration.
// Keeping it static avoids replaying the 343-league fan-out as hidden ISR work.
export const dynamic = "force-static";
export const revalidate = false;

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
