"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Game, GameWithStreams, Stream } from "@/lib/types";
import { PT_TZ, dateInPT } from "@/lib/datetime";
import type { SportScope, StatusFilter } from "@/lib/scope";
import { applyScope, statusCounts } from "@/lib/scope";
import { useGameStreams } from "@/lib/hooks";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import GameFeed from "@/components/GameFeed";
import LiveTicker from "@/components/LiveTicker";
import WatchPanel from "@/components/WatchPanel";
import type { LeagueDisplay, LeagueDisplayMap } from "@/lib/registry";
import { readNdjson } from "@/lib/ndjson";

interface Props {
  initialGames: GameWithStreams[];
  initialLeagueDisplay: LeagueDisplay[];
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

interface GamesResponse {
  games: GameWithStreams[];
  leagueDisplay: LeagueDisplay[];
}

interface ActiveSelection {
  id: string | null;
  automatic: boolean;
}

// Stable identity for "no streams" so WatchPanel's memoization isn't broken by a
// fresh [] literal on every render.
const NO_STREAMS: Stream[] = [];

function hasStreamBadge(game: GameWithStreams): boolean {
  return (game.streamCount ?? 0) > 0;
}

function initialDesktopGame(games: readonly GameWithStreams[]): GameWithStreams | undefined {
  return games.find((g) => g.status === "in" && hasStreamBadge(g))
    ?? games.find((g) => g.status === "pre" && hasStreamBadge(g))
    ?? games.find(hasStreamBadge)
    ?? games.find((g) => g.status === "in");
}

export default function App({ initialGames, initialLeagueDisplay }: Props) {
  const [search, setSearch] = useState("");
  const [dateIdx, setDateIdx] = useState(1);
  const [activeSport, setActiveSport] = useState<SportScope>("all");
  const [activeLeague, setActiveLeague] = useState<Game["league"] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(() => {
    const game = initialDesktopGame(initialGames);
    return { id: game?.id ?? null, automatic: Boolean(game) };
  });
  const [now, setNow] = useState(() => Date.now());
  const [fetchedGames, setFetchedGames] = useState<GameWithStreams[] | null>(null);
  const [fetchedLeagueDisplay, setFetchedLeagueDisplay] = useState<LeagueDisplay[] | null>(null);
  const [dateLoading, setDateLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoStreamsEnabled, setAutoStreamsEnabled] = useState(false);
  const activeGameId = activeSelection.id;
  const displayedActiveGameId = activeSelection.automatic && !autoStreamsEnabled
    ? null
    : activeGameId;

  useEffect(() => {
    const compactLandscape = window.innerWidth <= 950
      && window.innerHeight <= 500
      && window.innerWidth > window.innerHeight;
    if (window.innerWidth >= 900 && !compactLandscape) setAutoStreamsEnabled(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Labels only change when the PT calendar day rolls over, so key the memo on the PT
  // day rather than `now` — keeps it (and thus memo(TopBar)) stable between midnights.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dateLabels = useMemo(makeDateLabels, [dateInPT(now)]);

  useEffect(() => {
    if (dateIdx === 1) {
      setFetchedGames(null);
      setFetchedLeagueDisplay(null);
      setDateLoading(false);
      return;
    }
    const controller = new AbortController();
    setFetchedGames(null);
    setFetchedLeagueDisplay(null);
    setDateLoading(true);
    setActiveSelection({ id: null, automatic: false });
    setStatusFilter("all");
    fetch(`/api/games?date=${dateStrForIdx(dateIdx)}`, {
      headers: { accept: "application/x-ndjson, application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`game lookup failed: ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
          const data = await response.json() as GamesResponse;
          if (!controller.signal.aborted) {
            setFetchedGames(data.games ?? []);
            setFetchedLeagueDisplay(data.leagueDisplay ?? []);
            setDateLoading(false);
          }
          return;
        }

        let receivedGames = false;
        let failed = false;
        await readNdjson<GamesResponse & { type?: string }>(response.body, (update) => {
          if ((update.type === "schedule" || update.type === "complete") && Array.isArray(update.games)) {
            receivedGames = true;
            setFetchedGames(update.games);
            setFetchedLeagueDisplay(update.leagueDisplay ?? []);
            setDateLoading(false);
          }
          if (update.type === "error") failed = true;
        }, controller.signal);
        if (failed && !receivedGames) throw new Error("game lookup failed");
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch games for date:", dateIdx, e);
        setFetchedGames([]);
        setFetchedLeagueDisplay([]);
        setDateLoading(false);
      });
    return () => controller.abort();
  }, [dateIdx]);

  const rawGames = fetchedGames ?? initialGames;
  const leagueDisplay = fetchedGames === null
    ? initialLeagueDisplay
    : (fetchedLeagueDisplay ?? []);
  const leagueById = useMemo<LeagueDisplayMap>(() => {
    const out: Partial<Record<Game["league"], LeagueDisplay>> = {};
    for (const league of leagueDisplay) out[league.id] = league;
    return out;
  }, [leagueDisplay]);

  // Promote scheduled-but-started games from "pre" to "in" via wall clock.
  // Reuse the same array reference when no game actually crossed its start time,
  // so the 30s clock tick doesn't invalidate every downstream memo / re-render
  // the whole tree.
  const games = useMemo(() => {
    let changed = false;
    const promoted = rawGames.map((g) => {
      if (g.status !== "pre" || new Date(g.startTime).getTime() > now) return g;
      changed = true;
      return { ...g, status: "in" as Game["status"] };
    });
    return changed ? promoted : rawGames;
  }, [rawGames, now]);

  const hasLive = useMemo(() => games.some((g) => g.status === "in"), [games]);

  useEffect(() => {
    if (dateIdx !== 1) return;
    let inFlight: AbortController | null = null;
    function poll() {
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      fetch("/api/games", { signal: controller.signal })
        .then((r) => r.json())
        .then((data: GamesResponse) => {
          if (!controller.signal.aborted && Array.isArray(data.games) && data.games.length > 0) {
            setFetchedGames(data.games);
            setFetchedLeagueDisplay(data.leagueDisplay ?? []);
            setLastUpdated(new Date());
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) console.error("Live poll failed:", e);
        });
    }
    // The HTML carries an immediate build-time snapshot. Refresh once on hydration,
    // then retain the existing 30s live-score polling cadence when a game is active.
    poll();
    const id = hasLive ? setInterval(poll, 30_000) : null;
    return () => {
      inFlight?.abort();
      if (id) clearInterval(id);
    };
  }, [dateIdx, hasLive]);

  const filteredGames = useMemo(
    () => applyScope(games, activeSport, activeLeague, leagueById),
    [games, activeSport, activeLeague, leagueById]
  );

  const counts = useMemo(() => statusCounts(filteredGames), [filteredGames]);

  const activeGame = useMemo(
    () => games.find((g) => g.id === activeGameId) ?? null,
    [games, activeGameId]
  );
  const pickGame = useCallback((id: string) => {
    setActiveSelection({ id, automatic: false });
  }, []);
  const closeWatch = useCallback(() => {
    setActiveSelection({ id: null, automatic: false });
  }, []);
  const streamGame = activeSelection.automatic && !autoStreamsEnabled ? null : activeGame;
  const streamState = useGameStreams(streamGame);
  const activeStreams = streamState.gameId === activeGame?.id ? streamState.streams : NO_STREAMS;
  const activeStreamsLoading = activeGame !== null
    && (streamState.gameId !== activeGame.id || streamState.loading);
  const statusTabs: { id: StatusFilter; label: string; count: number; live: boolean }[] = [
    { id: "all", label: "All", count: counts.total, live: false },
    { id: "live", label: "Live", count: counts.live, live: true },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming, live: false },
    { id: "final", label: "Final", count: counts.final, live: false },
  ];

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
      <div className={`main ${activeGame ? "with-watch" : ""} ${activeSelection.automatic ? "auto-watch" : ""}`}>
        <Sidebar
          games={games}
          activeSport={activeSport}
          setActiveSport={setActiveSport}
          activeLeague={activeLeague}
          setActiveLeague={setActiveLeague}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          leagueDisplay={leagueDisplay}
          leagueById={leagueById}
        />
        <div className="center">
          <div className="filterbar">
            {statusTabs.map((t) => (
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
            activeGameId={displayedActiveGameId}
            onPick={pickGame}
            leagueById={leagueById}
          />
          <GameFeed
            games={filteredGames}
            activeGameId={displayedActiveGameId}
            onPick={pickGame}
            statusFilter={statusFilter}
            search={search}
            leagueDisplay={leagueDisplay}
            leagueById={leagueById}
          />
        </div>
        {activeGame && (
          <WatchPanel
            game={activeGame}
            streams={activeStreams}
            streamsLoading={activeStreamsLoading}
            leagueById={leagueById}
            onClose={closeWatch}
            allGames={games}
            onPick={pickGame}
          />
        )}
      </div>
    </div>
  );
}
