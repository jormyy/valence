"use client";

import type { GameWithStreams } from "@/lib/types";
import { formatTimePT } from "@/lib/espn";
import { teamColor } from "@/lib/metadata";
import { StreamIcon } from "@/components/icons";

interface Props {
  game: GameWithStreams;
  active: boolean;
  onPick: (id: string) => void;
}

export default function GameCard({ game, active, onPick }: Props) {
  const s = game.status;
  const showScore =
    s !== "pre" && game.awayTeam.score != null && game.homeTeam.score != null;
  const aScore = parseInt(game.awayTeam.score || "0");
  const hScore = parseInt(game.homeTeam.score || "0");
  const aWin = showScore && aScore > hScore;
  const hWin = showScore && hScore > aScore;

  return (
    <div
      className={`game ${active ? "active" : ""} ${s === "post" ? "final" : ""}`}
      onClick={() => onPick(game.id)}
    >
      <div className="g-time">
        {s === "in" ? (
          <span className="clock">{game.statusDisplay || "LIVE"}</span>
        ) : s === "pre" ? (
          <span className="when">{formatTimePT(game.startTime)}</span>
        ) : (
          <span className="final">Final</span>
        )}
      </div>

      <div className="g-teams">
        <div className={`team-row ${aWin ? "winner" : showScore ? "loser" : ""}`}>
          <TeamBadge abbr={game.awayTeam.abbreviation} />
          <span className="name">{game.awayTeam.name}</span>
          {showScore && <span className="score">{game.awayTeam.score}</span>}
        </div>
        <div className={`team-row ${hWin ? "winner" : showScore ? "loser" : ""}`}>
          <TeamBadge abbr={game.homeTeam.abbreviation} />
          <span className="name">{game.homeTeam.name}</span>
          {showScore && <span className="score">{game.homeTeam.score}</span>}
        </div>
      </div>

      <div className="g-meta">
        {s !== "post" && (
          <span className={`g-streams ${(game.streamCount ?? 0) === 0 ? "zero" : ""}`}>
            <StreamIcon />
            {game.streamCount ?? "—"}
          </span>
        )}
      </div>
    </div>
  );
}

function TeamBadge({ abbr }: { abbr: string }) {
  return (
    <div className="badge" style={{ background: teamColor(abbr) }}>
      {abbr.slice(0, 3)}
    </div>
  );
}
