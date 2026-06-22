"use client";

import { useMemo } from "react";
import type { GameWithStreams } from "@/lib/types";
import { LEAGUE_BY_ID } from "@/lib/registry";

interface Props {
  current: GameWithStreams;
  allGames: GameWithStreams[];
  onPick: (id: string) => void;
}

export default function RelatedGames({ current, allGames, onPick }: Props) {
  const related = useMemo(() => {
    const currentSport = LEAGUE_BY_ID[current.league]?.sport;
    return allGames
      .filter((g) =>
        g.id !== current.id &&
        g.status === "in" &&
        (g.league === current.league || LEAGUE_BY_ID[g.league]?.sport === currentSport)
      )
      .slice(0, 5);
  }, [allGames, current.id, current.league]);

  if (related.length === 0) return null;

  return (
    <div className="related">
      <h4>Also live</h4>
      {related.map((r) => (
        <div className="related-row" key={r.id} onClick={() => onPick(r.id)}>
          <span className="live-mini" />
          <span className="tag">{LEAGUE_BY_ID[r.league]?.short}</span>
          <span className="related-matchup">
            {r.awayTeam.abbreviation} {r.awayTeam.score} — {r.homeTeam.score} {r.homeTeam.abbreviation}
          </span>
          <span className="clk">{r.statusDisplay || ""}</span>
        </div>
      ))}
    </div>
  );
}
