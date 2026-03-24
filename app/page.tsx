import { getAllGames } from "@/lib/espn";
import { getStreams } from "@/lib/streams";
import GameCard from "@/components/GameCard";
import type { Game } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  const games = await getAllGames();

  const live = games.filter((g) => g.status === "in");
  const upcoming = games.filter((g) => g.status === "pre");
  const finished = games.filter((g) => g.status === "post");

  function renderSection(title: string, items: Game[]) {
    if (items.length === 0) return null;
    return (
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/50">
          {title}
        </h2>
        <div className="grid gap-3">
          {items.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              streamCount={getStreams(game.id).length}
            />
          ))}
        </div>
      </section>
    );
  }

  if (games.length === 0) {
    return (
      <div className="py-20 text-center text-white/40">
        No games scheduled today.
      </div>
    );
  }

  return (
    <>
      {renderSection("Live Now", live)}
      {renderSection("Upcoming", upcoming)}
      {renderSection("Final", finished)}
    </>
  );
}
