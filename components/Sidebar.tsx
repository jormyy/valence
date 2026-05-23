"use client";

import { useState } from "react";
import type { Game } from "@/lib/types";
import { SPORTS, LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";

interface Props {
  games: (Game & { streamCount?: number })[];
  activeSport: string;
  setActiveSport: (v: string) => void;
  activeLeague: string | null;
  setActiveLeague: (v: string | null) => void;
}

export default function Sidebar({ games, activeSport, setActiveSport, activeLeague, setActiveLeague }: Props) {
  const [expanded, setExpanded] = useState(new Set(SPORTS.map((s) => s.id)));

  // Count by sport
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
          <span style={{ fontFamily: "monospace", color: "var(--subtle)" }}>{SPORTS.length}</span>
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
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lg.label}</span>
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

function SportIcon({ sport }: { sport: string }) {
  const s = 15;
  const st = { stroke: "currentColor", strokeWidth: 1.4, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (sport) {
    case "basketball":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M2 8h12 M8 2v12 M3.5 3.5l9 9 M12.5 3.5l-9 9" /></svg>;
    case "baseball":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M3.5 4.5c2 1 2.5 4 2 6.5 M12.5 4.5c-2 1-2.5 4-2 6.5" /></svg>;
    case "tennis":
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="6" /><path d="M2.5 5.5c3 1.5 7 1.5 11 0 M2.5 10.5c3-1.5 7-1.5 11 0" /></svg>;
    default:
      return <svg width={s} height={s} viewBox="0 0 16 16" {...st}><circle cx="8" cy="8" r="5" /></svg>;
  }
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11V7a4 4 0 018 0v4l1 1H3z M7 13a1 1 0 002 0" />
    </svg>
  );
}
