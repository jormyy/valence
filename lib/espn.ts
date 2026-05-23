import type {
  Game, League, Team,
  EspnCompetitor, EspnCompetition, EspnEvent,
  EspnScoreboard, EspnTennisScoreboard, EspnSummary,
} from "./types";

const LEAGUE_CONFIGS: Record<string, { sport: string; path: string }> = {
  nba:   { sport: "basketball", path: "nba" },
  ncaab: { sport: "basketball", path: "mens-college-basketball" },
  mlb:   { sport: "baseball",   path: "mlb" },
  atp:   { sport: "tennis",     path: "atp" },
  wta:   { sport: "tennis",     path: "wta" },
};

const PT = "America/Los_Angeles";

export function formatTimePT(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoDate)) + " PT";
}

export function todayInPT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
}

// "20260521" → "2026-05-21"
function formatDateStr(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function gameDateInPT(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date(isoDate));
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

  const isTennis = league === "atp" || league === "wta";
  const parsePlayer = isTennis ? parseTennisPlayer : parseTeam;

  const statusDisplay = gameStatus === "pre"
    ? formatTimePT(event.date)
    : status.type.shortDetail;

  return {
    id: `${league}-${event.id}`,
    league,
    espnId: event.id,
    homeTeam: parsePlayer(home),
    awayTeam: parsePlayer(away),
    startTime: event.date,
    status: gameStatus,
    statusDisplay,
    period: status.period?.toString(),
    clock: status.displayClock,
  };
}

// Tennis scoreboard nests matches inside tournament groupings — flatten them
function flattenTennisEvents(data: EspnTennisScoreboard, league: League, targetDate: string): Game[] {
  const games: Game[] = [];
  for (const tournament of data.events ?? []) {
    for (const grouping of tournament.groupings ?? []) {
      for (const competition of grouping.competitions ?? []) {
        if (gameDateInPT(competition.date) !== targetDate) continue;
        const synthetic: EspnEvent = {
          id: competition.id,
          date: competition.date,
          status: competition.status,
          competitions: [competition as EspnCompetition],
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

export async function getGames(league: League, dateStr?: string): Promise<Game[]> {
  const config = LEAGUE_CONFIGS[league];
  const query = dateStr ? `?dates=${dateStr}` : "";
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/scoreboard${query}`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) return [];

  const data = await res.json();
  const isTennis = league === "atp" || league === "wta";
  const targetDate = dateStr ? formatDateStr(dateStr) : todayInPT();

  if (isTennis) return flattenTennisEvents(data as EspnTennisScoreboard, league, targetDate);

  return ((data as EspnScoreboard).events ?? [])
    .filter((e) => gameDateInPT(e.date) === targetDate)
    .map((e) => parseGame(e, league));
}

export async function getAllGames(dateStr?: string): Promise<Game[]> {
  const leagues: League[] = ["nba", "ncaab", "mlb", "atp", "wta"];
  const results = await Promise.all(leagues.map((l) => getGames(l, dateStr)));
  const all = results.flat();

  const order = { in: 0, pre: 1, post: 2 };
  return all.sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

export async function getEspnSummary(gameId: string): Promise<EspnSummary | null> {
  const dashIdx = gameId.indexOf("-");
  if (dashIdx === -1) return null;
  const league = gameId.slice(0, dashIdx);
  const espnId = gameId.slice(dashIdx + 1);
  const config = LEAGUE_CONFIGS[league];
  if (!config) return null;

  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.path}/summary?event=${espnId}`,
    { next: { revalidate: 30 } }
  );
  if (!res.ok) return null;
  return res.json();
}
