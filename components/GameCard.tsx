"use client";

import type { GameWithStreams } from "@/lib/types";
import { formatTimePT } from "@/lib/espn";
import { scoreView } from "@/lib/game";
import { teamColor } from "@/lib/metadata";
import { StreamIcon } from "@/components/icons";

interface Props {
  game: GameWithStreams;
  active: boolean;
  onPick: (id: string) => void;
}

export default function GameCard({ game, active, onPick }: Props) {
  const s = game.status;
  const sv = scoreView(game);

  return (
    <button
      type="button"
      className={`game ${active ? "active" : ""} ${s === "post" ? "final" : ""}`}
      onClick={() => onPick(game.id)}
      aria-pressed={active}
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
        <div className={`team-row ${sv.awayWin ? "winner" : sv.show ? "loser" : ""}`}>
          <TeamBadge abbr={game.awayTeam.abbreviation} />
          <span className="name">{game.awayTeam.name}</span>
          {sv.show && <span className="score">{game.awayTeam.score}</span>}
        </div>
        <div className={`team-row ${sv.homeWin ? "winner" : sv.show ? "loser" : ""}`}>
          <TeamBadge abbr={game.homeTeam.abbreviation} />
          <span className="name">{game.homeTeam.name}</span>
          {sv.show && <span className="score">{game.homeTeam.score}</span>}
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
    </button>
  );
}

function TeamBadge({ abbr }: { abbr: string }) {
  return (
    <div className="badge" style={{ background: teamColor(abbr) }}>
      {abbr.slice(0, 3)}
    </div>
  );
}
