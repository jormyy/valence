import { getAllGamesSnapshot } from "@/lib/espn";
import { parseGameId } from "@/lib/game-id";
import type { GameBootstrap } from "@/lib/game-bootstrap";
import { leagueDisplayForGames } from "@/lib/registry";
import { todayInPT } from "@/lib/datetime";
import App from "@/components/App";

export const dynamic = "force-static";
export const revalidate = 60;

export default async function Home() {
  const date = todayInPT();
  const snapshot = await getAllGamesSnapshot(date);
  const games = snapshot.games
    .filter((game) => parseGameId(game.id)?.espnId.startsWith("ppv:") !== true);
  const bootstrap: GameBootstrap | null = snapshot.complete && games.length > 0
    ? {
        games,
        leagueDisplay: leagueDisplayForGames(games),
        date,
        loadedAt: snapshot.loadedAt,
      }
    : null;

  // App never server-renders bootstrap games. It adopts them after hydration only
  // when their original load time is still inside the 60-second freshness window.
  return <App initialGames={[]} initialLeagueDisplay={[]} bootstrap={bootstrap} />;
}
