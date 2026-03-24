import type { Game, League, Team } from "./types";

const LEAGUE_CONFIGS: Record<League, { sport: string; path: string }> = {
  nba:   { sport: "basketball", path: "nba" },
  ncaab: { sport: "basketball", path: "mens-college-basketball" },
  mlb:   { sport: "baseball",   path: "mlb" },
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

function todayInPT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date()); // "YYYY-MM-DD"
}

function gameDateInPT(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date(isoDate));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTeam(team: any): Team {
  return {
    name: team.team.displayName,
    abbreviation: team.team.abbreviation,
    logo: team.team.logo,
    score: team.score,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGame(event: any, league: League): Game {
  const competition = event.competitions[0];
  const home = competition.competitors.find((c: any) => c.homeAway === "home");
  const away = competition.competitors.find((c: any) => c.homeAway === "away");
  const status = event.status;

  let gameStatus: Game["status"] = "pre";
  if (status.type.state === "in") gameStatus = "in";
  else if (status.type.state === "post") gameStatus = "post";

  // For upcoming games replace ESPN's "X:XX PM ET" with PT time
  let statusDisplay: string = status.type.shortDetail;
  if (gameStatus === "pre") {
    statusDisplay = formatTimePT(event.date);
  }

  return {
    id: `${league}-${event.id}`,
    league,
    espnId: event.id,
    homeTeam: parseTeam(home),
    awayTeam: parseTeam(away),
    startTime: event.date,
    status: gameStatus,
    statusDisplay,
    period: status.period?.toString(),
    clock: status.displayClock,
  };
}

export async function getGames(league: League): Promise<Game[]> {
  const { sport, path } = LEAGUE_CONFIGS[league];
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/${path}/scoreboard`,
    { next: { revalidate: 60 } }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const today = todayInPT();

  return (data.events ?? [])
    .filter((e: any) => gameDateInPT(e.date) === today)
    .map((e: any) => parseGame(e, league));
}

export async function getAllGames(): Promise<Game[]> {
  const [nba, ncaab, mlb] = await Promise.all([
    getGames("nba"),
    getGames("ncaab"),
    getGames("mlb"),
  ]);

  const all = [...nba, ...ncaab, ...mlb];

  // Sort: live first, then upcoming by start time, then finished
  const order = { in: 0, pre: 1, post: 2 };
  return all.sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });
}
