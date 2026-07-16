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
  partial?: boolean;
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
    return { id: game?.id ?? null, automatic: true };
  });
  const [now, setNow] = useState(() => Date.now());
  const [fetchedGames, setFetchedGames] = useState<GameWithStreams[] | null>(null);
  const [fetchedLeagueDisplay, setFetchedLeagueDisplay] = useState<LeagueDisplay[] | null>(null);
  const [dateLoading, setDateLoading] = useState(initialGames.length === 0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [schedulePartial, setSchedulePartial] = useState(false);
  const [autoStreamsEnabled, setAutoStreamsEnabled] = useState(false);
  const activeGameId = activeSelection.id;
  const displayedActiveGameId = activeSelection.automatic && !autoStreamsEnabled
    ? null
    : activeGameId;

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 900px)");
    const compactLandscapeQuery = window.matchMedia(
      "(max-width: 950px) and (max-height: 500px) and (orientation: landscape)",
    );
    function syncAutoStreams() {
      setAutoStreamsEnabled(desktopQuery.matches && !compactLandscapeQuery.matches);
    }
    const viewportObserver = new ResizeObserver(syncAutoStreams);
    syncAutoStreams();
    viewportObserver.observe(document.documentElement);
    desktopQuery.addEventListener("change", syncAutoStreams);
    compactLandscapeQuery.addEventListener("change", syncAutoStreams);
    window.addEventListener("resize", syncAutoStreams, { passive: true });
    return () => {
      viewportObserver.disconnect();
      desktopQuery.removeEventListener("change", syncAutoStreams);
      compactLandscapeQuery.removeEventListener("change", syncAutoStreams);
      window.removeEventListener("resize", syncAutoStreams);
    };
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
      setDateLoading(initialGames.length === 0);
      setSchedulePartial(false);
      setActiveSelection({ id: null, automatic: true });
      return;
    }
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setFetchedGames(null);
    setFetchedLeagueDisplay(null);
    setDateLoading(true);
    setSchedulePartial(false);
    setActiveSelection({ id: null, automatic: false });
    setStatusFilter("all");
    async function load(attempt: number) {
      let receivedGames = false;
      let partial = false;
      try {
        const response = await fetch(`/api/games?date=${dateStrForIdx(dateIdx)}`, {
          headers: { accept: "application/x-ndjson, application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`game lookup failed: ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
          const data = await response.json() as GamesResponse;
          if (!controller.signal.aborted) {
            receivedGames = true;
            partial = data.partial === true;
            setFetchedGames(data.games ?? []);
            setFetchedLeagueDisplay(data.leagueDisplay ?? []);
            setDateLoading(false);
            setSchedulePartial(partial);
          }
        } else {
          let failed = false;
          await readNdjson<GamesResponse & { type?: string }>(response.body, (update) => {
            if ((update.type === "schedule" || update.type === "complete") && Array.isArray(update.games)) {
              receivedGames = true;
              partial = update.partial === true;
              setFetchedGames(update.games);
              setFetchedLeagueDisplay(update.leagueDisplay ?? []);
              setDateLoading(false);
              setSchedulePartial(partial);
            }
            if (update.type === "error") failed = true;
          }, controller.signal);
          if (failed && !receivedGames) throw new Error("game lookup failed");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch games for date:", dateIdx, error);
        if (!receivedGames) {
          setFetchedGames([]);
          setFetchedLeagueDisplay([]);
          setDateLoading(false);
          setSchedulePartial(false);
        }
      }

      if (partial && attempt < 2 && !controller.signal.aborted) {
        retryTimer = setTimeout(() => void load(attempt + 1), 2_000 * (2 ** attempt));
      }
    }
    void load(0);
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
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

  useEffect(() => {
    if (dateIdx !== 1) return;
    let inFlight: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    async function poll(attempt = 0) {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      let partial = false;
      let failedRequest = false;
      const accept = (data: GamesResponse, selectAutomatic: boolean) => {
        if (controller.signal.aborted || !Array.isArray(data.games)) return;
        partial = data.partial === true;
        setFetchedGames(data.games);
        setFetchedLeagueDisplay(data.leagueDisplay ?? []);
        setDateLoading(false);
        setSchedulePartial(partial);
        setLastUpdated(new Date());
        setActiveSelection((selection) => {
          if (!selection.automatic) return selection;
          const retained = data.games.find((game) => game.id === selection.id);
          if (retained) return selection;
          if (!selectAutomatic) return { id: null, automatic: true };
          return { id: initialDesktopGame(data.games)?.id ?? null, automatic: true };
        });
      };

      try {
        const response = await fetch("/api/games", {
          headers: { accept: "application/x-ndjson, application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`game lookup failed: ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
          accept(await response.json() as GamesResponse, true);
        } else {
          let receivedGames = false;
          let failed = false;
          await readNdjson<GamesResponse & { type?: string }>(response.body, (update) => {
            if ((update.type === "schedule" || update.type === "complete") && Array.isArray(update.games)) {
              receivedGames = true;
              accept(update, update.type === "complete");
            }
            if (update.type === "error") failed = true;
          }, controller.signal);
          if (failed && !receivedGames) throw new Error("game lookup failed");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failedRequest = true;
          console.error("Live poll failed:", error);
          setDateLoading(false);
        }
      }
      if ((partial || failedRequest) && attempt < 2 && !controller.signal.aborted) {
        retryTimer = setTimeout(() => void poll(attempt + 1), 2_000 * (2 ** attempt));
      }
    }
    void poll();
    const id = setInterval(() => void poll(), 30_000);
    return () => {
      inFlight?.abort();
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(id);
    };
  }, [dateIdx]);

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
  const watchVisible = streamGame !== null;
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
        schedulePartial={schedulePartial}
      />
      <div className={`main ${watchVisible ? "with-watch" : ""} ${activeSelection.automatic ? "auto-watch" : ""}`}>
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
            loading={dateLoading || (schedulePartial && games.length === 0)}
          />
        </div>
        {watchVisible && activeGame && (
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
