"use client";

import type { GameWithStreams } from "@/lib/types";
import { LEAGUE_BY_ID } from "@/lib/metadata";
import { scoreView } from "@/lib/game";

interface Props {
  games: GameWithStreams[];
  activeGameId: string | null;
  onPick: (id: string) => void;
}

export default function LiveTicker({ games, activeGameId, onPick }: Props) {
  const live = games.filter((g) => g.status === "in");
  if (live.length === 0) return null;

  return (
    <div className="ticker">
      <div className="ticker-label">
        <span className="live-dot" />
        Live
      </div>
      {live.map((g) => {
        const lg = LEAGUE_BY_ID[g.league];
        const sv = scoreView(g);

        return (
          <button
            type="button"
            key={g.id}
            className={`ticker-chip ${activeGameId === g.id ? "active" : ""}`}
            onClick={() => onPick(g.id)}
          >
            <span className="league">{lg.short}</span>
            <span className="matchup">
              <span className={sv.awayWin ? "team-w" : "team-l"}>{g.awayTeam.abbreviation}</span>{" "}
              <span className="score">{g.awayTeam.score}</span>
              <span className="sep">·</span>
              <span className={sv.homeWin ? "team-w" : "team-l"}>{g.homeTeam.abbreviation}</span>{" "}
              <span className="score">{g.homeTeam.score}</span>
            </span>
            <span className="clk">{g.statusDisplay || "LIVE"}</span>
          </button>
        );
      })}
    </div>
  );
}
