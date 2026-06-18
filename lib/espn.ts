import type {
  Game, League, Team,
  EspnCompetitor, EspnCompetition, EspnEvent,
  EspnScoreboard, EspnTennisScoreboard, EspnSummary,
} from "./types";
import type { EspnParser } from "./registry";
import { LEAGUES, LEAGUE_BY_ID } from "./registry";
import { SCOREBOARD_TIMEOUT_MS, fetchWithTimeout } from "./upstream";
import { makeGameId, parseGameId } from "./game-id";

interface FetchOptions {
  readonly signal?: AbortSignal;
}

export const PT_TZ = "America/Los_Angeles";

export const STATUS_ORDER: Record<Game["status"], number> = { in: 0, pre: 1, post: 2 };

export function formatTimePT(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoDate)) + " PT";
}

export function todayInPT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ }).format(new Date());
}

// "20260521" → "2026-05-21"
function formatDateStr(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export function normalizeEspnDate(dateStr?: string): string | null {
  if (!dateStr) return todayInPT();
  if (/^\d{8}$/.test(dateStr)) return formatDateStr(dateStr);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return null;
}

export function normalizeEspnDateParam(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  if (/^\d{8}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr.replaceAll("-", "");
  return undefined;
}

export function isTodayEspnDate(dateStr?: string): boolean {
  return normalizeEspnDate(dateStr) === todayInPT();
}

function gameDateInPT(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ }).format(new Date(isoDate));
}

function safeGameDateInPT(isoDate: unknown): string | null {
  if (typeof isoDate !== "string") return null;
  try {
    return gameDateInPT(isoDate);
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
    logo: t.logo,
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
    logo: a.headshot?.href ?? "",
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
  }
  return unreachableParser(parser);
}

function parseGame(event: EspnEvent, league: League): Game {
  const competition = event.competitions[0];
  const home = competition.competitors.find((c) => c.homeAway === "home")
    ?? competition.competitors[1];
  const away = competition.competitors.find((c) => c.homeAway === "away")
    ?? competition.competitors[0];
  const status = event.status;

  let gameStatus: Game["status"] = "pre";
  if (status.type.state === "in") gameStatus = "in";
  else if (status.type.state === "post") gameStatus = "post";

  const parser = LEAGUE_BY_ID[league].espn.parser;

  const statusDisplay = gameStatus === "pre"
    ? formatTimePT(event.date)
    : status.type.shortDetail;

  return {
    id: makeGameId(league, event.id),
    league,
    espnId: event.id,
    homeTeam: parseCompetitor(home, parser),
    awayTeam: parseCompetitor(away, parser),
    startTime: event.date,
    status: gameStatus,
    statusDisplay,
    period: status.period?.toString(),
    clock: status.displayClock,
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
  const config = LEAGUE_BY_ID[league].espn;
  const query = dateStr ? `?dates=${dateStr}` : "";
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/scoreboard${query}`,
      { signal: options?.signal, next: { revalidate: 60 }, timeoutMs: SCOREBOARD_TIMEOUT_MS }
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
  const targetDate = dateStr ? formatDateStr(dateStr) : todayInPT();
  const parser: EspnParser = config.parser;

  switch (parser) {
    case "team":
      return parseTeamEvents(data, league, targetDate);
    case "tennis":
      return flattenTennisEvents(data, league, targetDate);
  }
  return unreachableParser(parser);
}

export async function getAllGames(dateStr?: string, options?: FetchOptions): Promise<Game[]> {
  const results = await Promise.all(LEAGUES.map((l) => getGames(l.id, dateStr, options)));
  return results.flat().sort((a, b) => {
    const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (diff !== 0) return diff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

export async function getEspnSummary(gameId: string, options?: FetchOptions): Promise<EspnSummary | null> {
  const parsed = parseGameId(gameId);
  if (!parsed) return null;
  const { league, espnId } = parsed;
  const config = LEAGUE_BY_ID[league].espn;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/summary?event=${espnId}`,
      { signal: options?.signal, next: { revalidate: 30 }, timeoutMs: SCOREBOARD_TIMEOUT_MS }
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
}
