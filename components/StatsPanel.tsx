"use client";

import { useEffect, useState } from "react";
import type { Game, TeamStats } from "@/lib/types";

interface Props {
  gameId: Game["id"];
  status: Game["status"];
}

export default function StatsPanel({ gameId, status }: Props) {
  const [stats, setStats] = useState<TeamStats[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setLoading(true);
    fetch(`/api/stats/${gameId}`)
      .then((r) => r.json())
      .then((data: { leaders?: TeamStats[] }) => {
        if (!cancelled) {
          setStats(data.leaders ?? []);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to fetch stats:", e);
        if (!cancelled) {
          setStats([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [gameId]);

  if (loading) {
    return <div className="stats-empty">Loading…</div>;
  }
  if (!stats || stats.length === 0) {
    return (
      <div className="stats-empty">
        {status === "pre"
          ? "Stats will appear once the game tips off."
          : "No stat leaders available for this game."}
      </div>
    );
  }

  return (
    <div className="stats-panel">
      {stats.map((team) => (
        <div key={team.teamName} className="stats-team">
          <div className="stats-team-name">{team.teamName}</div>
          {team.leaders.map((l) => (
            <div key={l.category} className="stats-row">
              <span className="stats-cat">{l.category}</span>
              <span className="stats-athlete">{l.athlete}</span>
              <span className="stats-val">{l.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
