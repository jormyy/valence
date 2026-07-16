"use client";

import { memo } from "react";
import type { GameWithStreams } from "@/lib/types";
import type { LeagueDisplayMap } from "@/lib/registry";
import { scoreView } from "@/lib/game";

interface Props {
  games: GameWithStreams[];
  activeGameId: string | null;
  onPick: (id: string) => void;
  leagueById: LeagueDisplayMap;
}

function LiveTicker({ games, activeGameId, onPick, leagueById }: Props) {
  const live = games.filter((g) => g.status === "in");
  if (live.length === 0) return null;

  return (
    <div className="ticker">
      <div className="ticker-label">
        <span className="live-dot" />
        Live
      </div>
      {live.map((g) => {
        const lg = leagueById[g.league];
        const sv = scoreView(g);

        return (
          <button
            type="button"
            key={g.id}
            className={`ticker-chip ${activeGameId === g.id ? "active" : ""}`}
            onClick={() => onPick(g.id)}
          >
            <span className="league">{lg?.short ?? g.league}</span>
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

export default memo(LiveTicker);
