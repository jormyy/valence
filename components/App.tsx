"use client";

import { useState, useEffect, useMemo } from "react";
import type { Game, Stream } from "@/lib/types";
import { LEAGUE_BY_ID } from "@/lib/metadata";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import GameFeed from "@/components/GameFeed";
import LiveTicker from "@/components/LiveTicker";
import WatchPanel from "@/components/WatchPanel";

interface GameWithStreams extends Game {
  streamCount?: number;
}

interface Props {
  initialGames: GameWithStreams[];
}

export default function App({ initialGames }: Props) {
  const [search, setSearch] = useState("");
  const [dateIdx, setDateIdx] = useState(1);
  const [activeSport, setActiveSport] = useState("all");
  const [activeLeague, setActiveLeague] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const games = useMemo(() =>
    initialGames.map((g) => ({
      ...g,
      status: (g.status === "pre" && new Date(g.startTime).getTime() <= now ? "in" : g.status) as Game["status"],
    })),
    [initialGames, now]
  );

  useEffect(() => {
    if (!activeGameId) {
      const live = games.find((g) => g.status === "in");
      if (live) setActiveGameId(live.id);
    }
  }, []);

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (activeLeague) return g.league === activeLeague;
      if (activeSport === "live") return g.status === "in";
      if (activeSport === "upcoming") return g.status === "pre";
      if (activeSport !== "all") return LEAGUE_BY_ID[g.league]?.sport === activeSport;
      return true;
    });
  }, [games, activeSport, activeLeague]);

  const counts = useMemo(() => {
    const scope = activeLeague
      ? games.filter((g) => g.league === activeLeague)
      : activeSport === "all" || activeSport === "live" || activeSport === "upcoming"
        ? games
        : games.filter((g) => LEAGUE_BY_ID[g.league]?.sport === activeSport);
    let live = 0, upcoming = 0, final = 0;
    for (const g of scope) {
      if (g.status === "in") live++;
      else if (g.status === "pre") upcoming++;
      else final++;
    }
    return { live, upcoming, final, total: scope.length };
  }, [games, activeSport, activeLeague]);

  const activeGame = games.find((g) => g.id === activeGameId) || null;

  const [activeStreams, setActiveStreams] = useState<Stream[]>([]);
  useEffect(() => {
    if (!activeGame) { setActiveStreams([]); return; }
    let cancelled = false;
    fetch(`/api/streams/${activeGame.id}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setActiveStreams(data.streams || []); })
      .catch(() => { if (!cancelled) setActiveStreams([]); });
    return () => { cancelled = true; };
  }, [activeGame?.id]);

  return (
    <div className="shell">
      <TopBar
        search={search}
        setSearch={setSearch}
        dateIdx={dateIdx}
        setDateIdx={setDateIdx}
        liveCount={counts.live}
      />
      <div className={`main ${activeGame ? "with-watch" : ""}`}>
        <Sidebar
          games={filteredGames}
          activeSport={activeSport}
          setActiveSport={setActiveSport}
          activeLeague={activeLeague}
          setActiveLeague={setActiveLeague}
        />
        <div className="center">
          <div className="filterbar">
            {([
              { id: "all", label: "All", count: counts.total, live: false as const },
              { id: "live", label: "Live", count: counts.live, live: true as const },
              { id: "upcoming", label: "Upcoming", count: counts.upcoming, live: false as const },
              { id: "final", label: "Final", count: counts.final, live: false as const },
            ]).map((t) => (
              <button
                key={t.id}
                className={`tab-pill ${statusFilter === t.id ? "active" : ""} ${t.live ? "live-tab" : ""}`}
                onClick={() => setStatusFilter(t.id)}
              >
                {t.label}
                <span className="badge">{t.count}</span>
              </button>
            ))}
          </div>
          <LiveTicker
            games={games}
            activeGameId={activeGameId}
            onPick={setActiveGameId}
          />
          <GameFeed
            games={filteredGames}
            activeGameId={activeGameId}
            onPick={setActiveGameId}
            statusFilter={statusFilter}
            search={search}
          />
        </div>
        {activeGame && (
          <WatchPanel
            game={activeGame}
            streams={activeStreams}
            onClose={() => setActiveGameId(null)}
            allGames={games}
            onPick={setActiveGameId}
          />
        )}
      </div>
    </div>
  );
}
