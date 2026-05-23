"use client";

import type { Game } from "@/lib/types";
import { formatTimePT } from "@/lib/espn";

interface Props {
  game: Game & { streamCount?: number };
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
  const timeStr = formatTimePT(game.startTime);

  return (
    <div
      className={`game ${active ? "active" : ""} ${s === "post" ? "final" : ""}`}
      onClick={() => onPick(game.id)}
    >
      {/* Time column */}
      <div className="g-time">
        {s === "in" ? (
          <span className="clock">{game.statusDisplay || "LIVE"}</span>
        ) : s === "pre" ? (
          <span className="when">{timeStr}</span>
        ) : (
          <span className="final">Final</span>
        )}
      </div>

      {/* Teams */}
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

      {/* Meta */}
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
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return (
    <div
      className="badge"
      style={{ background: `oklch(0.62 0.14 ${hue})` }}
    >
      {abbr.slice(0, 3)}
    </div>
  );
}

function StreamIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="9" height="8" rx="1" />
      <path d="M11 7l3-2v6l-3-2z" />
    </svg>
  );
}
