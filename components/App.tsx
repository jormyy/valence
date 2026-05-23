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

const PT = "America/Los_Angeles";

function ptCalendarDate(): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

// Returns YYYYMMDD in PT tz: idx 0=yesterday, 1=today, 2=tomorrow
function dateStrForIdx(idx: number): string {
  const { y, m, d } = ptCalendarDate();
  const date = new Date(y, m - 1, d + (idx - 1));
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function makeDateLabels(): [string, string, string] {
  const { y, m, d } = ptCalendarDate();
  const fmt = (offset: number): string => {
    if (offset === 0) return "Today";
    const date = new Date(y, m - 1, d + offset);
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
    return `${wd} ${md}`;
  };
  return [fmt(-1), fmt(0), fmt(1)];
}

export default function App({ initialGames }: Props) {
  const [search, setSearch] = useState("");
  const [dateIdx, setDateIdx] = useState(1);
  const [activeSport, setActiveSport] = useState("all");
  const [activeLeague, setActiveLeague] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fetchedGames, setFetchedGames] = useState<GameWithStreams[] | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const dateLabels = useMemo(() => makeDateLabels(), []);

  // Tick clock every 30s for pre→in promotion
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch games when navigating to non-today dates
  useEffect(() => {
    if (dateIdx === 1) {
      setFetchedGames(null);
      setDateLoading(false);
      return;
    }
    let cancelled = false;
    setFetchedGames(null); // clear stale data from previous non-today date immediately
    setDateLoading(true);
    setActiveGameId(null);
    setStatusFilter("all");
    const dateStr = dateStrForIdx(dateIdx);
    fetch(`/api/games?date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setFetchedGames(data.games || []);
          setDateLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedGames([]);
          setDateLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dateIdx]);

  const rawGames = fetchedGames ?? initialGames;

  const games = useMemo(() =>
    rawGames.map((g) => ({
      ...g,
      status: (g.status === "pre" && new Date(g.startTime).getTime() <= now
        ? "in"
        : g.status) as Game["status"],
    })),
    [rawGames, now]
  );

  // Auto-select first live game on mount
  useEffect(() => {
    if (!activeGameId) {
      const live = games.find((g) => g.status === "in");
      if (live) setActiveGameId(live.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasLive = useMemo(() => games.some((g) => g.status === "in"), [games]);

  // Poll for live score updates when viewing today and live games exist
  useEffect(() => {
    if (dateIdx !== 1 || !hasLive) return;
    let cancelled = false;
    const id = setInterval(() => {
      fetch("/api/games")
        .then((r) => r.json())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((data: any) => {
          if (!cancelled && Array.isArray(data.games) && data.games.length > 0) {
            setFetchedGames(data.games);
            setLastUpdated(new Date());
          }
        })
        .catch(() => {});
    }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [dateIdx, hasLive]);

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
        dateLabels={dateLabels}
        liveCount={counts.live}
        dateLoading={dateLoading}
        lastUpdated={lastUpdated}
      />
      <div className={`main ${activeGame ? "with-watch" : ""}`}>
        <Sidebar
          games={games}
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
