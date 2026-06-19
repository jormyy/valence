import type {
  Game, League, Team,
  EspnCompetitor, EspnCompetition, EspnEvent,
  EspnScoreboard, EspnTennisScoreboard, EspnSummary, EspnStatus,
} from "./types";
import type { EspnParser } from "./registry";
import { LEAGUES, LEAGUE_BY_ID, hasEspnSchedule } from "./registry";
import { SCOREBOARD_TIMEOUT_MS, fetchWithTimeout } from "./upstream";
import { makeGameId, parseGameId } from "./game-id";
import { getSourceGames } from "./source-events";

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

function abbreviationFor(name: string): string {
  const words = name
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "EVT";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 4).map((word) => word[0]).join("").toUpperCase();
}

function teamFromName(name: string): Team {
  return {
    name,
    abbreviation: abbreviationFor(name),
    logo: "",
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
    espnId: event.id,
    eventName: event.name,
    shortName: event.shortName,
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
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

  const targetDate = normalizeEspnDate(dateStr);
  if (!targetDate) return [];

  const config = leagueInfo.espn;
  const dateParam = normalizeEspnDateParam(dateStr ?? targetDate);
  const query = dateParam ? `?dates=${dateParam}` : "";
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

export async function getAllGames(dateStr?: string, options?: FetchOptions): Promise<Game[]> {
  const [espnResults, sourceGames] = await Promise.all([
    Promise.all(LEAGUES.map((l) => getGames(l.id, dateStr, options))),
    getSourceGames(dateStr, options),
  ]);
  return [...espnResults.flat(), ...sourceGames].sort((a, b) => {
    const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (diff !== 0) return diff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

export async function getEspnSummary(gameId: string, options?: FetchOptions): Promise<EspnSummary | null> {
  const parsed = parseGameId(gameId);
  if (!parsed) return null;
  const { league, espnId } = parsed;
  const leagueInfo = LEAGUE_BY_ID[league];
  if (!hasEspnSchedule(leagueInfo)) return null;
  const config = leagueInfo.espn;

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
