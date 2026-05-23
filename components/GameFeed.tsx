"use client";

import { useMemo } from "react";
import type { Game, League } from "@/lib/types";
import { LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";
import GameCard from "@/components/GameCard";

interface GameWithStreams extends Game {
  streamCount?: number;
}

interface Props {
  games: GameWithStreams[];
  activeGameId: string | null;
  onPick: (id: string) => void;
  statusFilter: string;
  search: string;
}

export default function GameFeed({ games, activeGameId, onPick, statusFilter, search }: Props) {
  const visible = useMemo(() => {
    return games.filter((g) => {
      if (statusFilter === "live" && g.status !== "in") return false;
      if (statusFilter === "upcoming" && g.status !== "pre") return false;
      if (statusFilter === "final" && g.status !== "post") return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [
          g.awayTeam.name, g.awayTeam.abbreviation,
          g.homeTeam.name, g.homeTeam.abbreviation,
          LEAGUE_BY_ID[g.league]?.label,
          LEAGUE_BY_ID[g.league]?.short,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [games, statusFilter, search]);

  const grouped = useMemo(() => {
    const out = new Map<League, GameWithStreams[]>();
    for (const g of visible) {
      if (!out.has(g.league)) out.set(g.league, []);
      out.get(g.league)!.push(g);
    }

    const order = LEAGUES.reduce((acc, l, i) => { acc[l.id] = i; return acc; }, {} as Record<string, number>);

    return [...out.entries()]
      .map(([lid, gs]) => {
        const lg = LEAGUE_BY_ID[lid];
        const live = gs.filter((x) => x.status === "in").length;
        gs.sort((a, b) => {
          const sa = a.status;
          const sb = b.status;
          const so: Record<string, number> = { in: 0, pre: 1, post: 2 };
          if (so[sa] !== so[sb]) return so[sa] - so[sb];
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        return { lg, games: gs, live };
      })
      .sort((a, b) => {
        if (a.live !== b.live) return b.live - a.live;
        return (order[a.lg.id] ?? 99) - (order[b.lg.id] ?? 99);
      });
  }, [visible]);

  if (visible.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No games match your filters</div>
        {search ? `No results for "${search}"` : "Try a different sport or status filter."}
      </div>
    );
  }

  return (
    <div className="game-area">
      {grouped.map(({ lg, games: gs, live }) => (
        <div className="league-section" key={lg.id}>
          <div className="league-header">
            <span style={{ color: "var(--muted)" }}>
              <SportIcon sport={lg.sport} />
            </span>
            <h3>{lg.label}</h3>
            <span className="region">{lg.region}</span>
            <span className="count">
              {live > 0 && <><span className="live-n">{live} live</span> · </>}
              {gs.length} games
            </span>
          </div>
          <div className="games grid comfy">
            {gs.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                active={g.id === activeGameId}
                onPick={onPick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SportIcon({ sport }: { sport: string }) {
  const s = 13;
  const st = { stroke: "currentColor", strokeWidth: 1.4, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (sport) {
    case "basketball":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M2 8h12 M8 2v12 M3.5 3.5l9 9 M12.5 3.5l-9 9" /></svg>;
    case "baseball":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M3.5 4.5c2 1 2.5 4 2 6.5 M12.5 4.5c-2 1-2.5 4-2 6.5" /></svg>;
    case "tennis":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M2.5 5.5c3 1.5 7 1.5 11 0 M2.5 10.5c3-1.5 7-1.5 11 0" /></svg>;
    default:
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="5" /></svg>;
  }
}
