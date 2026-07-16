import App from "@/components/App";

// Keep the permanent artifact data-free. A build-day sports snapshot becomes
// misleading after midnight; App progressively fills this shell from /api/games.
export const dynamic = "force-static";
export const revalidate = false;

export default function Home() {
  return <App initialGames={[]} initialLeagueDisplay={[]} />;
}
