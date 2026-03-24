"use client";

import { useState } from "react";
import GameCard from "@/components/GameCard";
import type { Game, League } from "@/lib/types";

interface GameWithStreams extends Game {
  streamCount: number;
}

interface Props {
  games: GameWithStreams[];
}

const FILTERS = [
  { label: "All", value: "all" },
  { label: "NBA", value: "nba" },
  { label: "NCAAB", value: "ncaab" },
  { label: "MLB", value: "mlb" },
] as const;

type Filter = "all" | League;

export default function GameFeed({ games }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = filter === "all" ? games : games.filter((g) => g.league === filter);

  const live = visible.filter((g) => g.status === "in");
  const upcoming = visible.filter((g) => g.status === "pre");
  const finished = visible.filter((g) => g.status === "post");

  function Section({ title, items }: { title: string; items: GameWithStreams[] }) {
    if (items.length === 0) return null;
    return (
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/50">
          {title}
        </h2>
        <div className="grid gap-3">
          {items.map((game) => (
            <GameCard key={game.id} game={game} streamCount={game.streamCount} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Sport filter tabs */}
      <div className="mb-8 flex gap-2">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === value
                ? "bg-white text-black"
                : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="py-20 text-center text-white/40">No games.</div>
      ) : (
        <>
          <Section title="Live Now" items={live} />
          <Section title="Upcoming" items={upcoming} />
          <Section title="Final" items={finished} />
        </>
      )}
    </>
  );
}
