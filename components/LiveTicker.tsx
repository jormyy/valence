"use client";

import type { Game } from "@/lib/types";
import { LEAGUE_BY_ID } from "@/lib/metadata";

interface Props {
  games: (Game & { streamCount?: number })[];
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
        const aScore = parseInt(g.awayTeam.score || "0");
        const hScore = parseInt(g.homeTeam.score || "0");
        const aWin = aScore > hScore;

        return (
          <div
            key={g.id}
            className={`ticker-chip ${activeGameId === g.id ? "active" : ""}`}
            onClick={() => onPick(g.id)}
          >
            <span className="league">{lg.short}</span>
            <span className="matchup">
              <span style={{ color: aWin ? "var(--fg)" : "var(--muted)" }}>
                {g.awayTeam.abbreviation}
              </span>{" "}
              <span className="score">{g.awayTeam.score}</span>
              <span style={{ color: "var(--subtle)", margin: "0 4px" }}>·</span>
              <span style={{ color: !aWin ? "var(--fg)" : "var(--muted)" }}>
                {g.homeTeam.abbreviation}
              </span>{" "}
              <span className="score">{g.homeTeam.score}</span>
            </span>
            <span className="clk">{g.statusDisplay || "LIVE"}</span>
          </div>
        );
      })}
    </div>
  );
}
