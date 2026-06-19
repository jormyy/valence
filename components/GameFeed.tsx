"use client";

import { useMemo } from "react";
import type { GameWithStreams, League } from "@/lib/types";
import { LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";
import { STATUS_ORDER } from "@/lib/espn";
import type { StatusFilter } from "@/lib/scope";
import { applyStatusFilter } from "@/lib/scope";
import { SportIcon } from "@/components/icons";
import GameCard from "@/components/GameCard";

interface Props {
  games: GameWithStreams[];
  activeGameId: string | null;
  onPick: (id: string) => void;
  statusFilter: StatusFilter;
  search: string;
}

const LEAGUE_ORDER: Record<string, number> = LEAGUES.reduce((acc, l, i) => {
  acc[l.id] = i;
  return acc;
}, {} as Record<string, number>);

export default function GameFeed({ games, activeGameId, onPick, statusFilter, search }: Props) {
  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return applyStatusFilter(games, statusFilter).filter((g) => {
      if (!q) return true;
      const lg = LEAGUE_BY_ID[g.league];
      const hay = [
        g.awayTeam.name, g.awayTeam.abbreviation,
        g.homeTeam.name, g.homeTeam.abbreviation,
        lg?.label, lg?.short,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [games, statusFilter, search]);

  const grouped = useMemo(() => {
    const out = new Map<League, GameWithStreams[]>();
    for (const g of visible) {
      if (!out.has(g.league)) out.set(g.league, []);
      out.get(g.league)!.push(g);
    }

    return [...out.entries()]
      .map(([lid, gs]) => {
        gs.sort((a, b) => {
          const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          return diff !== 0 ? diff : new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        const live = gs.filter((x) => x.status === "in").length;
        const lg = LEAGUE_BY_ID[lid];
        // Generic 24/7 channel buckets (no scheduled fixtures) shouldn't bury real games.
        const isChannel = !lg.espn;
        return { lg, games: gs, live, isChannel };
      })
      .sort((a, b) => {
        if (a.isChannel !== b.isChannel) return a.isChannel ? 1 : -1;
        if (a.live !== b.live) return b.live - a.live;
        return (LEAGUE_ORDER[a.lg.id] ?? 99) - (LEAGUE_ORDER[b.lg.id] ?? 99);
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
