"use client";

import { useState, useEffect, useMemo } from "react";
import type { Game, GameWithStreams } from "@/lib/types";
import { PT_TZ } from "@/lib/espn";
import { applyScope, statusCounts } from "@/lib/scope";
import { useGameStreams } from "@/lib/hooks";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import GameFeed from "@/components/GameFeed";
import LiveTicker from "@/components/LiveTicker";
import WatchPanel from "@/components/WatchPanel";

interface Props {
  initialGames: GameWithStreams[];
}

function ptCalendarDate(): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

// idx 0=yesterday, 1=today, 2=tomorrow → "YYYYMMDD" in PT
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

interface GamesResponse { games: GameWithStreams[] }

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Recompute labels with `now` so the "Today" pivot follows the clock past midnight
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dateLabels = useMemo(makeDateLabels, [now]);

  useEffect(() => {
    if (dateIdx === 1) {
      setFetchedGames(null);
      setDateLoading(false);
      return;
    }
    let cancelled = false;
    setFetchedGames(null);
    setDateLoading(true);
    setActiveGameId(null);
    setStatusFilter("all");
    fetch(`/api/games?date=${dateStrForIdx(dateIdx)}`)
      .then((r) => r.json())
      .then((data: GamesResponse) => {
        if (!cancelled) {
          setFetchedGames(data.games ?? []);
          setDateLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to fetch games for date:", dateIdx, e);
        if (!cancelled) {
          setFetchedGames([]);
          setDateLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [dateIdx]);

  const rawGames = fetchedGames ?? initialGames;

  // Promote scheduled-but-started games from "pre" to "in" via wall clock
  const games = useMemo(() =>
    rawGames.map((g) => ({
      ...g,
      status: (g.status === "pre" && new Date(g.startTime).getTime() <= now
        ? "in"
        : g.status) as Game["status"],
    })),
    [rawGames, now]
  );

  // Auto-select first live game once on mount (intentionally empty deps)
  useEffect(() => {
    const live = games.find((g) => g.status === "in");
    if (live) setActiveGameId(live.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasLive = useMemo(() => games.some((g) => g.status === "in"), [games]);

  useEffect(() => {
    if (dateIdx !== 1 || !hasLive) return;
    let cancelled = false;
    const id = setInterval(() => {
      fetch("/api/games")
        .then((r) => r.json())
        .then((data: GamesResponse) => {
          if (!cancelled && Array.isArray(data.games) && data.games.length > 0) {
            setFetchedGames(data.games);
            setLastUpdated(new Date());
          }
        })
        .catch((e) => console.error("Live poll failed:", e));
    }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [dateIdx, hasLive]);

  const filteredGames = useMemo(
    () => applyScope(games, activeSport, activeLeague),
    [games, activeSport, activeLeague]
  );

  // Counts ignore the live/upcoming filter pseudo-sports — those filter the feed,
  // not the count scope. League filter still narrows; "all" sport shows everything.
  const counts = useMemo(() => {
    const sport = activeSport === "live" || activeSport === "upcoming" ? "all" : activeSport;
    return statusCounts(applyScope(games, sport, activeLeague));
  }, [games, activeSport, activeLeague]);

  const activeGame = games.find((g) => g.id === activeGameId) ?? null;
  const activeStreams = useGameStreams(activeGame?.id ?? null);

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
