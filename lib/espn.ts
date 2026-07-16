import type {
  Game, League, Team,
  EspnCompetitor, EspnCompetition, EspnEvent,
  EspnSummary, EspnStatus,
} from "./types";
import type { EspnParser } from "./registry";
import { LEAGUES, LEAGUE_BY_ID, hasEspnSchedule } from "./registry";
import { SCOREBOARD_TIMEOUT_MS, fetchWithTimeout } from "./upstream";
import { makeGameId, parseGameId } from "./game-id";
import { getSourceGames } from "./source-events";
import { mapLimit } from "./concurrency";
import { dateInPT, formatTimePT, normalizeDate } from "./datetime";
import { teamFromName } from "./team";
import { STATUS_ORDER } from "./game-status";
import { AsyncTtlCache } from "./async-ttl-cache";

interface FetchOptions {
  readonly signal?: AbortSignal;
}

export function normalizeEspnDateParam(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  if (/^\d{8}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr.replaceAll("-", "");
  return undefined;
}

function safeGameDateInPT(isoDate: unknown): string | null {
  if (typeof isoDate !== "string") return null;
  try {
    return dateInPT(isoDate);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTeam(c: EspnCompetitor): Team {
  const t = c.team!;
  return {
    name: t.displayName,
    abbreviation: t.abbreviation,
    score: c.score,
  };
}

// Tennis competitors have `athlete` instead of `team`
function parseTennisPlayer(c: EspnCompetitor): Team {
  const a = c.athlete ?? {};
  const name = a.displayName ?? "Unknown";
  const parts = name.split(" ");
  const abbr = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1].slice(0, 3)).toUpperCase()
    : name.slice(0, 3).toUpperCase();
  return {
    name,
    abbreviation: abbr,
    score: c.score,
  };
}

function unreachableParser(parser: never): never {
  throw new Error(`Unhandled ESPN parser: ${parser}`);
}

function parseCompetitor(c: EspnCompetitor, parser: EspnParser): Team {
  switch (parser) {
    case "team":
      return parseTeam(c);
    case "tennis":
      return parseTennisPlayer(c);
    case "event":
      return teamFromName("Event");
  }
  return unreachableParser(parser);
}

function eventMatchupParts(event: EspnEvent, league: League): readonly [string, string] {
  const title = event.name ?? event.shortName ?? LEAGUE_BY_ID[league].label;
  const headline = title.includes(":") ? title.split(":").at(-1)!.trim() : title;
  const parts = headline
    .split(/\s+(?:vs\.?|v\.?|at)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return [parts[0], parts.slice(1).join(" ")];
  return [LEAGUE_BY_ID[league].short, title];
}

function parseEventTeams(event: EspnEvent, league: League): { homeTeam: Team; awayTeam: Team } {
  const [away, home] = eventMatchupParts(event, league);
  return {
    awayTeam: teamFromName(away),
    homeTeam: teamFromName(home),
  };
}

function statusDetail(status: EspnStatus): string {
  return status.type.shortDetail
    ?? status.type.detail
    ?? status.type.description
    ?? status.type.state;
}

function parseGame(event: EspnEvent, league: League): Game {
  const competition = event.competitions[0];
  const status = event.status;

  let gameStatus: Game["status"] = "pre";
  if (status.type.state === "in") gameStatus = "in";
  else if (status.type.state === "post") gameStatus = "post";

  const leagueInfo = LEAGUE_BY_ID[league];
  if (!hasEspnSchedule(leagueInfo)) {
    throw new Error(`League has no ESPN schedule: ${league}`);
  }
  const parser = leagueInfo.espn.parser;
  const teams = parser === "event"
    ? parseEventTeams(event, league)
    : (() => {
        const home = competition.competitors.find((c) => c.homeAway === "home")
          ?? competition.competitors[1];
        const away = competition.competitors.find((c) => c.homeAway === "away")
          ?? competition.competitors[0];
        return {
          homeTeam: parseCompetitor(home, parser),
          awayTeam: parseCompetitor(away, parser),
        };
      })();

  const statusDisplay = gameStatus === "pre"
    ? formatTimePT(event.date)
    : statusDetail(status);

  return {
    id: makeGameId(league, event.id),
    league,
    eventName: event.name,
    shortName: event.shortName,
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    startTime: event.date,
    status: gameStatus,
    statusDisplay,
  };
}

// Tennis scoreboard nests matches inside tournament groupings — flatten them
function flattenTennisEvents(data: unknown, league: League, targetDate: string): Game[] {
  const games: Game[] = [];
  if (!isRecord(data) || !Array.isArray(data.events)) return games;
  for (const tournament of data.events) {
    if (!isRecord(tournament) || !Array.isArray(tournament.groupings)) continue;
    for (const grouping of tournament.groupings) {
      if (!isRecord(grouping) || !Array.isArray(grouping.competitions)) continue;
      for (const competition of grouping.competitions) {
        if (!isRecord(competition) || safeGameDateInPT(competition.date) !== targetDate) continue;
        const synthetic: EspnEvent = {
          id: String(competition.id ?? ""),
          name: typeof competition.name === "string" ? competition.name : undefined,
          shortName: typeof competition.shortName === "string" ? competition.shortName : undefined,
          date: String(competition.date ?? ""),
          status: competition.status as EspnCompetition["status"],
          competitions: [competition as unknown as EspnCompetition],
        };
        try {
          games.push(parseGame(synthetic, league));
        } catch {
          // Skip malformed competitions from ESPN API
        }
      }
    }
  }
  return games;
}

function parseTeamEvents(data: unknown, league: League, targetDate: string): Game[] {
  const games: Game[] = [];
  if (!isRecord(data) || !Array.isArray(data.events)) return games;
  for (const event of data.events) {
    if (!isRecord(event) || safeGameDateInPT(event.date) !== targetDate) continue;
    try {
      games.push(parseGame(event as unknown as EspnEvent, league));
    } catch {
      // ESPN occasionally emits incomplete events; keep the rest of the league usable.
    }
  }
  return games;
}

export async function getGames(league: League, dateStr?: string, options?: FetchOptions): Promise<Game[]> {
  const leagueInfo = LEAGUE_BY_ID[league];
  if (!hasEspnSchedule(leagueInfo)) return [];

  const targetDate = normalizeDate(dateStr);
  if (!targetDate) return [];

  const config = leagueInfo.espn;
  const query = `?dates=${targetDate.replaceAll("-", "")}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/scoreboard${query}`,
      { signal: options?.signal, cache: "no-store", timeoutMs: SCOREBOARD_TIMEOUT_MS }
    );
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  const parser: EspnParser = config.parser;

  switch (parser) {
    case "team":
      return parseTeamEvents(data, league, targetDate);
    case "tennis":
      return flattenTennisEvents(data, league, targetDate);
    case "event":
      return parseTeamEvents(data, league, targetDate);
  }
  return unreachableParser(parser);
}

// Cap concurrent ESPN scoreboard fetches — the registry now spans hundreds of
// leagues, and firing them all at once risks rate limiting and slow first loads.
// NOTE: this fans out one request per scheduled league (~hundreds). It's amortized
// by the bounded 60s aggregate cache below; gating leagues blindly would silently
// drop in-season games because the registry does not carry season metadata.
const SCOREBOARD_CONCURRENCY = 16;
const GAMES_CACHE_MS = 60_000;
const GAMES_CACHE_DATES = 3;

// Only leagues with an ESPN schedule produce scoreboard fetches; channel-only leagues
// return nothing, so keep them out of the fan-out entirely.
const ESPN_LEAGUES = LEAGUES.filter((league) => "espn" in league);
const gamesCache = new AsyncTtlCache<string, Game[]>(GAMES_CACHE_MS, GAMES_CACHE_DATES);
const summaryCache = new AsyncTtlCache<string, EspnSummary | null>(30_000, 64);

async function loadAllGames(dateStr: string, signal: AbortSignal): Promise<Game[]> {
  const [espnResults, sourceGames] = await Promise.all([
    mapLimit(ESPN_LEAGUES, SCOREBOARD_CONCURRENCY, (l) => getGames(l.id, dateStr, { signal }), signal),
    getSourceGames(dateStr, { signal }),
  ]);
  return [...espnResults.flat(), ...sourceGames].sort((a, b) => {
    const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (diff !== 0) return diff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

export async function getAllGames(dateStr?: string, options?: FetchOptions): Promise<Game[]> {
  const targetDate = normalizeDate(dateStr);
  if (!targetDate) return [];
  return gamesCache.get(
    targetDate,
    (signal) => loadAllGames(targetDate, signal),
    options?.signal,
  );
}

export async function getEspnSummary(gameId: string, options?: FetchOptions): Promise<EspnSummary | null> {
  const parsed = parseGameId(gameId);
  if (!parsed) return null;
  const { league, espnId } = parsed;
  const leagueInfo = LEAGUE_BY_ID[league];
  if (!hasEspnSchedule(leagueInfo)) return null;
  const config = leagueInfo.espn;

  return summaryCache.get(gameId, async (signal) => {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/summary?event=${espnId}`,
        { signal, cache: "no-store", timeoutMs: SCOREBOARD_TIMEOUT_MS }
      );
    } catch {
      return null;
    }
    if (!res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }, options?.signal);
}
