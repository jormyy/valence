import type { Game, League, Team } from "./types";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTeam(competitor: any): Team {
  return {
    name: competitor.team.displayName,
    abbreviation: competitor.team.abbreviation,
    logo: competitor.team.logo,
    score: competitor.score,
  };
}

// Tennis competitors have `athlete` instead of `team`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTennisPlayer(competitor: any): Team {
  const athlete = competitor.athlete ?? {};
  const name: string = athlete.displayName ?? "Unknown";
  const parts = name.split(" ");
  const abbr = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1].slice(0, 3)).toUpperCase()
    : name.slice(0, 3).toUpperCase();
  return {
    name,
    abbreviation: abbr,
    logo: athlete.headshot?.href ?? "",
    score: competitor.score,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGame(event: any, league: League): Game {
  const competition = event.competitions[0];
  const home = competition.competitors.find((c: any) => c.homeAway === "home")
    ?? competition.competitors[1];
  const away = competition.competitors.find((c: any) => c.homeAway === "away")
    ?? competition.competitors[0];
  const status = event.status;

  let gameStatus: Game["status"] = "pre";
  if (status.type.state === "in") gameStatus = "in";
  else if (status.type.state === "post") gameStatus = "post";

  const isTennis = league === "atp" || league === "wta";
  const parsePlayer = isTennis ? parseTennisPlayer : parseTeam;

  let statusDisplay: string = status.type.shortDetail;
  if (gameStatus === "pre") statusDisplay = formatTimePT(event.date);

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenTennisEvents(data: any, league: League, targetDate: string): Game[] {
  const games: Game[] = [];

  for (const tournament of data.events ?? []) {
    for (const grouping of tournament.groupings ?? []) {
      for (const competition of grouping.competitions ?? []) {
        if (gameDateInPT(competition.date) !== targetDate) continue;
        const synthetic = {
          id: competition.id,
          date: competition.date,
          status: competition.status,
          competitions: [competition],
        };
        try {
          games.push(parseGame(synthetic, league));
        } catch {
          // skip malformed competitions
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

  if (isTennis) return flattenTennisEvents(data, league, targetDate);

  return (data.events ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((e: any) => gameDateInPT(e.date) === targetDate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => parseGame(e, league));
}

export async function getAllGames(dateStr?: string): Promise<Game[]> {
  const [nba, ncaab, mlb, atp, wta] = await Promise.all([
    getGames("nba", dateStr),
    getGames("ncaab", dateStr),
    getGames("mlb", dateStr),
    getGames("atp", dateStr),
    getGames("wta", dateStr),
  ]);

  const all = [...nba, ...ncaab, ...mlb, ...atp, ...wta];

  const order = { in: 0, pre: 1, post: 2 };
  return all.sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}

export async function getEspnSummary(gameId: string): Promise<Record<string, unknown> | null> {
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
