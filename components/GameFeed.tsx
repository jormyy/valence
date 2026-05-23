"use client";

import { useMemo } from "react";
import type { GameWithStreams, League } from "@/lib/types";
import { LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";
import { SportIcon } from "@/components/icons";
import GameCard from "@/components/GameCard";

interface Props {
  games: GameWithStreams[];
  activeGameId: string | null;
  onPick: (id: string) => void;
  statusFilter: string;
  search: string;
}

const STATUS_ORDER: Record<string, number> = { in: 0, pre: 1, post: 2 };

export default function GameFeed({ games, activeGameId, onPick, statusFilter, search }: Props) {
  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return games.filter((g) => {
      if (statusFilter === "live" && g.status !== "in") return false;
      if (statusFilter === "upcoming" && g.status !== "pre") return false;
      if (statusFilter === "final" && g.status !== "post") return false;
      if (q) {
        const lg = LEAGUE_BY_ID[g.league];
        const hay = [
          g.awayTeam.name, g.awayTeam.abbreviation,
          g.homeTeam.name, g.homeTeam.abbreviation,
          lg?.label, lg?.short,
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

    const leagueOrder = LEAGUES.reduce((acc, l, i) => { acc[l.id] = i; return acc; }, {} as Record<string, number>);

    return [...out.entries()]
      .map(([lid, gs]) => {
        const lg = LEAGUE_BY_ID[lid];
        const live = gs.filter((x) => x.status === "in").length;
        gs.sort((a, b) => {
          const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (diff !== 0) return diff;
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        return { lg, games: gs, live };
      })
      .sort((a, b) => {
        if (a.live !== b.live) return b.live - a.live;
        return (leagueOrder[a.lg.id] ?? 99) - (leagueOrder[b.lg.id] ?? 99);
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
            <span className="dim"><SportIcon sport={lg.sport} size={13} /></span>
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
