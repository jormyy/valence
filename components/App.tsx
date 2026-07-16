"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import {
  GAME_BOOTSTRAP_TTL_MS,
  isGameBootstrapFresh,
  type GameBootstrap,
} from "@/lib/game-bootstrap";

interface Props {
  initialGames: GameWithStreams[];
  initialLeagueDisplay: LeagueDisplay[];
  bootstrap: GameBootstrap | null;
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
  loading?: boolean;
}

interface ActiveSelection {
  id: string | null;
  automatic: boolean;
  settled: boolean;
}

type SchedulePhase = "prefix" | "schedule" | "complete";

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
    ?? games.find((g) => g.status === "in")
    ?? games.find((g) => g.status === "pre")
    ?? games[0];
}

export default function App({ initialGames, initialLeagueDisplay, bootstrap }: Props) {
  const [search, setSearch] = useState("");
  const [dateIdx, setDateIdx] = useState(1);
  const [activeSport, setActiveSport] = useState<SportScope>("all");
  const [activeLeague, setActiveLeague] = useState<Game["league"] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(() => {
    const game = initialDesktopGame(initialGames);
    return { id: game?.id ?? null, automatic: true, settled: initialGames.length > 0 };
  });
  const [now, setNow] = useState(() => Date.now());
  const [fetchedGames, setFetchedGames] = useState<GameWithStreams[] | null>(null);
  const [fetchedLeagueDisplay, setFetchedLeagueDisplay] = useState<LeagueDisplay[] | null>(null);
  const [dateLoading, setDateLoading] = useState(initialGames.length === 0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [schedulePartial, setSchedulePartial] = useState(false);
  const [scheduleUnavailable, setScheduleUnavailable] = useState(false);
  const [autoStreamsEnabled, setAutoStreamsEnabled] = useState(false);
  const [manualGame, setManualGame] = useState<GameWithStreams | null>(null);
  const hasCompleteDisplay = useRef(initialGames.length > 0);
  const freshScheduleReceived = useRef(initialGames.length > 0);
  const manualGameRef = useRef<GameWithStreams | null>(null);
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
      hasCompleteDisplay.current = initialGames.length > 0;
      freshScheduleReceived.current = initialGames.length > 0;
      setFetchedGames(null);
      setFetchedLeagueDisplay(null);
      setDateLoading(initialGames.length === 0);
      setSchedulePartial(false);
      setScheduleUnavailable(false);
      setActiveSelection({ id: null, automatic: true, settled: false });
      manualGameRef.current = null;
      setManualGame(null);
      return;
    }
    hasCompleteDisplay.current = false;
    freshScheduleReceived.current = false;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setFetchedGames(null);
    setFetchedLeagueDisplay(null);
    setDateLoading(true);
    setSchedulePartial(false);
    setScheduleUnavailable(false);
    setActiveSelection({ id: null, automatic: false, settled: true });
    manualGameRef.current = null;
    setManualGame(null);
    setStatusFilter("all");
    async function load(attempt: number) {
      if (attempt === 0) {
        setDateLoading(true);
        setScheduleUnavailable(false);
      }
      let receivedGames = false;
      let partial = false;
      let failedRequest = false;
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
            setScheduleUnavailable(false);
          }
        } else {
          let failed = false;
          await readNdjson<GamesResponse & { type?: string }>(response.body, (update) => {
            if ((update.type === "schedule" || update.type === "complete") && Array.isArray(update.games)) {
              receivedGames = true;
              partial = update.partial === true;
              setFetchedGames(update.games);
              setFetchedLeagueDisplay(update.leagueDisplay ?? []);
              setDateLoading(update.loading === true);
              setSchedulePartial(partial);
              setScheduleUnavailable(false);
            }
            if (update.type === "error") failed = true;
          }, controller.signal);
          if (failed && !receivedGames) throw new Error("game lookup failed");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        failedRequest = true;
        console.error("Failed to fetch games for date:", dateIdx, error);
        if (!receivedGames) {
          const retrying = attempt < 2;
          if (!retrying) {
            setFetchedGames([]);
            setFetchedLeagueDisplay([]);
          }
          setDateLoading(retrying);
          setSchedulePartial(retrying);
          setScheduleUnavailable(!retrying);
        }
      }

      if ((partial || failedRequest) && !controller.signal.aborted) {
        const retryingImmediately = attempt < 2;
        retryTimer = setTimeout(
          () => void load(retryingImmediately ? attempt + 1 : 0),
          retryingImmediately ? 2_000 * (2 ** attempt) : 30_000,
        );
      }
    }
    void load(0);
    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [dateIdx]);

  useEffect(() => {
    if (dateIdx !== 1 || !bootstrap || !isGameBootstrapFresh(bootstrap)) return;
    hasCompleteDisplay.current = true;
    freshScheduleReceived.current = false;
    setFetchedGames(bootstrap.games);
    setFetchedLeagueDisplay(bootstrap.leagueDisplay);
    setDateLoading(true);
    setSchedulePartial(false);
    setScheduleUnavailable(false);
    setActiveSelection({
      id: initialDesktopGame(bootstrap.games)?.id ?? null,
      automatic: true,
      settled: false,
    });
    const expiresIn = Math.max(0, bootstrap.loadedAt + GAME_BOOTSTRAP_TTL_MS - Date.now());
    const expiryTimer = setTimeout(() => {
      if (freshScheduleReceived.current) return;
      hasCompleteDisplay.current = false;
      setFetchedGames([]);
      setFetchedLeagueDisplay((current) => {
        const retainedLeague = manualGameRef.current?.league;
        return retainedLeague ? (current ?? []).filter((league) => league.id === retainedLeague) : [];
      });
      setDateLoading(false);
      setSchedulePartial(false);
      setScheduleUnavailable(true);
      setActiveSelection((selection) => selection.automatic
        ? { id: null, automatic: true, settled: false }
        : selection);
    }, expiresIn);
    return () => clearTimeout(expiryTimer);
  }, [bootstrap, dateIdx]);

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
      const accept = (data: GamesResponse, phase: SchedulePhase) => {
        if (controller.signal.aborted || !Array.isArray(data.games)) return;
        partial = data.partial === true;
        if (phase === "prefix" && hasCompleteDisplay.current) return;
        if (partial && hasCompleteDisplay.current) {
          setDateLoading(data.loading === true);
          setSchedulePartial(true);
          setScheduleUnavailable(false);
          return;
        }

        const authoritativeSchedule = phase !== "prefix" && !partial;
        const countedSchedule = phase === "complete" && !partial;
        if (authoritativeSchedule) {
          hasCompleteDisplay.current = true;
          freshScheduleReceived.current = true;
        }
        setFetchedGames(data.games);
        setFetchedLeagueDisplay(data.leagueDisplay ?? []);
        setDateLoading(data.loading === true);
        setSchedulePartial(partial);
        setScheduleUnavailable(false);
        setLastUpdated(new Date());
        setActiveSelection((selection) => {
          if (!selection.automatic) return selection;
          const retained = data.games.find((game) => game.id === selection.id);
          if (retained && !countedSchedule) return { ...selection, settled: false };
          return {
            id: initialDesktopGame(data.games)?.id ?? null,
            automatic: true,
            settled: countedSchedule,
          };
        });
      };

      try {
        const response = await fetch("/api/games", {
          headers: { accept: "application/x-ndjson, application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`game lookup failed: ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
          accept(await response.json() as GamesResponse, "complete");
        } else {
          let receivedGames = false;
          let failed = false;
          await readNdjson<GamesResponse & { type?: string }>(response.body, (update) => {
            if ((update.type === "schedule" || update.type === "complete") && Array.isArray(update.games)) {
              receivedGames = true;
              const phase: SchedulePhase = update.type === "complete"
                ? "complete"
                : update.loading === true ? "prefix" : "schedule";
              accept(update, phase);
            }
            if (update.type === "error") failed = true;
          }, controller.signal);
          if (failed && !receivedGames) throw new Error("game lookup failed");
          if (failed) failedRequest = true;
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failedRequest = true;
          console.error("Live poll failed:", error);
          const retrying = attempt < 2;
          setDateLoading(retrying);
          setSchedulePartial(true);
          setScheduleUnavailable(!retrying && !hasCompleteDisplay.current);
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
    () => games.find((g) => g.id === activeGameId)
      ?? (!activeSelection.automatic && manualGame?.id === activeGameId ? manualGame : null),
    [games, activeGameId, activeSelection.automatic, manualGame]
  );
  const pickGame = useCallback((id: string) => {
    const game = games.find((candidate) => candidate.id === id) ?? null;
    manualGameRef.current = game;
    setManualGame(game);
    setActiveSelection({ id, automatic: false, settled: true });
  }, [games]);
  const closeWatch = useCallback(() => {
    manualGameRef.current = null;
    setManualGame(null);
    setActiveSelection({ id: null, automatic: false, settled: true });
  }, []);
  const watchGame = activeSelection.automatic && !autoStreamsEnabled ? null : activeGame;
  const streamGame = activeSelection.automatic && !activeSelection.settled ? null : watchGame;
  const watchVisible = watchGame !== null;
  const streamState = useGameStreams(streamGame);
  const activeStreams = streamState.gameId === watchGame?.id ? streamState.streams : NO_STREAMS;
  const activeStreamsLoading = watchGame !== null
    && (!activeSelection.settled || streamState.gameId !== watchGame.id || streamState.loading);
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
            unavailable={scheduleUnavailable}
          />
        </div>
        {watchVisible && watchGame && (
          <WatchPanel
            game={watchGame}
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
