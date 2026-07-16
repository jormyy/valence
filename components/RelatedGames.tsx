"use client";

import { useMemo } from "react";
import type { GameWithStreams } from "@/lib/types";
import type { LeagueDisplayMap } from "@/lib/registry";

interface Props {
  current: GameWithStreams;
  allGames: GameWithStreams[];
  onPick: (id: string) => void;
  leagueById: LeagueDisplayMap;
}

export default function RelatedGames({ current, allGames, onPick, leagueById }: Props) {
  const related = useMemo(() => {
    const currentSport = leagueById[current.league]?.sport;
    return allGames
      .filter((g) =>
        g.id !== current.id &&
        g.status === "in" &&
        (g.league === current.league || leagueById[g.league]?.sport === currentSport)
      )
      .slice(0, 5);
  }, [allGames, current.id, current.league, leagueById]);

  if (related.length === 0) return null;

  return (
    <div className="related">
      <h4>Also live</h4>
      {related.map((r) => (
        <div className="related-row" key={r.id} onClick={() => onPick(r.id)}>
          <span className="live-mini" />
          <span className="tag">{leagueById[r.league]?.short ?? r.league}</span>
          <span className="related-matchup">
            {r.awayTeam.abbreviation} {r.awayTeam.score} — {r.homeTeam.score} {r.homeTeam.abbreviation}
          </span>
          <span className="clk">{r.statusDisplay || ""}</span>
        </div>
      ))}
    </div>
  );
}
