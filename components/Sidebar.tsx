"use client";

import { useMemo, useState } from "react";
import type { GameWithStreams } from "@/lib/types";
import { SPORTS, LEAGUES, LEAGUE_BY_ID } from "@/lib/metadata";
import { statusCounts } from "@/lib/scope";
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

  const { sportCounts, leagueCounts, totalLive, totalUp } = useMemo(() => {
    const sportGroups = new Map<string, GameWithStreams[]>();
    const leagueGroups = new Map<string, GameWithStreams[]>();
    for (const g of games) {
      const lg = LEAGUE_BY_ID[g.league];
      if (!lg) continue;
      (sportGroups.get(lg.sport) ?? sportGroups.set(lg.sport, []).get(lg.sport)!).push(g);
      (leagueGroups.get(g.league) ?? leagueGroups.set(g.league, []).get(g.league)!).push(g);
    }
    const sportCounts = new Map([...sportGroups].map(([k, gs]) => [k, statusCounts(gs)]));
    const leagueCounts = new Map([...leagueGroups].map(([k, gs]) => [k, statusCounts(gs)]));
    let totalLive = 0, totalUp = 0;
    for (const c of sportCounts.values()) { totalLive += c.live; totalUp += c.upcoming; }
    return { sportCounts, leagueCounts, totalLive, totalUp };
  }, [games]);

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
          const c = sportCounts.get(sport.id);
          if (!c || c.total === 0) return null;
          const isOpen = expanded.has(sport.id);
          const sportActive = activeSport === sport.id && !activeLeague;
          const sportLeagues = LEAGUES.filter(
            (l) => l.sport === sport.id && (leagueCounts.get(l.id)?.total ?? 0) > 0
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
                    const lc = leagueCounts.get(lg.id);
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
                          {(lc?.live ?? 0) > 0 && <span className="live-n">{lc!.live}</span>}
                          <span>{lc?.total ?? 0}</span>
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
