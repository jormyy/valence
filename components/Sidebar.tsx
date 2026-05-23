"use client";

import { useState } from "react";
import type { GameWithStreams } from "@/lib/types";
import { SPORTS, LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";
import { SportIcon, GridIcon, BellIcon } from "@/components/icons";

interface Props {
  games: GameWithStreams[];
  activeSport: string;
  setActiveSport: (v: string) => void;
  activeLeague: string | null;
  setActiveLeague: (v: string | null) => void;
}

export default function Sidebar({ games, activeSport, setActiveSport, activeLeague, setActiveLeague }: Props) {
  const [expanded, setExpanded] = useState(new Set(SPORTS.map((s) => s.id)));

  const sCounts: Record<string, { live: number; upcoming: number; total: number }> = {};
  const lCounts: Record<string, { live: number; total: number }> = {};
  for (const g of games) {
    const lg = LEAGUE_BY_ID[g.league];
    if (!lg) continue;
    const sp = lg.sport;
    if (!sCounts[sp]) sCounts[sp] = { live: 0, upcoming: 0, total: 0 };
    sCounts[sp].total++;
    if (g.status === "in") sCounts[sp].live++;
    else if (g.status === "pre") sCounts[sp].upcoming++;

    if (!lCounts[g.league]) lCounts[g.league] = { live: 0, total: 0 };
    lCounts[g.league].total++;
    if (g.status === "in") lCounts[g.league].live++;
  }

  const totalLive = Object.values(sCounts).reduce((a, b) => a + b.live, 0);
  const totalUp = Object.values(sCounts).reduce((a, b) => a + b.upcoming, 0);

  function toggleSport(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <aside className="rail">
      <div className="rail-section">
        <div className="rail-label"><span>Browse</span></div>
        <button
          className={`rail-item ${activeSport === "all" ? "active" : ""}`}
          onClick={() => { setActiveSport("all"); setActiveLeague(null); }}
        >
          <span className="rail-icon"><GridIcon /></span>
          <span>All sports</span>
          <span className="rail-count">{games.length}</span>
        </button>
        <button
          className={`rail-item ${activeSport === "live" ? "active" : ""}`}
          onClick={() => { setActiveSport("live"); setActiveLeague(null); }}
        >
          <span className="rail-icon"><span className="live-dot" /></span>
          <span>Live now</span>
          <span className="rail-count"><span className="live-n">{totalLive}</span></span>
        </button>
        <button
          className={`rail-item ${activeSport === "upcoming" ? "active" : ""}`}
          onClick={() => { setActiveSport("upcoming"); setActiveLeague(null); }}
        >
          <span className="rail-icon"><BellIcon /></span>
          <span>Upcoming</span>
          <span className="rail-count">{totalUp}</span>
        </button>
      </div>

      <div className="rail-section">
        <div className="rail-label">
          <span>Sports</span>
          <span className="sport-count">{SPORTS.length}</span>
        </div>
        {SPORTS.map((sport) => {
          const c = sCounts[sport.id];
          if (!c || c.total === 0) return null;
          const isOpen = expanded.has(sport.id);
          const sportActive = activeSport === sport.id && !activeLeague;
          const sportLeagues = LEAGUES.filter(
            (l) => l.sport === sport.id && lCounts[l.id]?.total > 0
          );

          return (
            <div className="sport-group" key={sport.id}>
              <button
                className={`rail-item ${sportActive ? "active" : ""}`}
                onClick={() => {
                  toggleSport(sport.id);
                  setActiveSport(sport.id);
                  setActiveLeague(null);
                }}
              >
                <span className="rail-icon"><SportIcon sport={sport.id} /></span>
                <span>{sport.label}</span>
                <span className="rail-count">
                  {c.live > 0 && <span className="live-n">{c.live}</span>}
                  <span>{c.total}</span>
                </span>
              </button>
              {isOpen && sportLeagues.length > 0 && (
                <div className="sport-leagues">
                  {sportLeagues.map((lg) => {
                    const lc = lCounts[lg.id] || { live: 0, total: 0 };
                    const lActive = activeLeague === lg.id;
                    return (
                      <button
                        className={`rail-sub ${lActive ? "active" : ""}`}
                        key={lg.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSport(sport.id);
                          setActiveLeague(lg.id);
                        }}
                      >
                        <span className="rail-sub-label">{lg.label}</span>
                        <span className="rail-count">
                          {lc.live > 0 && <span className="live-n">{lc.live}</span>}
                          <span>{lc.total}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
