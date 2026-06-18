export const SPORTS = [
  { id: "basketball", label: "Basketball" },
  { id: "baseball", label: "Baseball" },
  { id: "tennis", label: "Tennis" },
] as const;

export type Sport = (typeof SPORTS)[number]["id"];
export type StreamCategory = Sport;
export type EspnParser = "team" | "tennis";

type LeagueRegistryEntry = {
  readonly id: string;
  readonly sport: Sport;
  readonly label: string;
  readonly short: string;
  readonly region: string;
  readonly streamCategory: StreamCategory;
  readonly espn: {
    readonly sport: string;
    readonly path: string;
    readonly parser: EspnParser;
  };
};

export const LEAGUES = [
  {
    id: "nba",
    sport: "basketball",
    label: "NBA",
    short: "NBA",
    region: "USA",
    streamCategory: "basketball",
    espn: { sport: "basketball", path: "nba", parser: "team" },
  },
  {
    id: "ncaab",
    sport: "basketball",
    label: "NCAA Men's",
    short: "NCAAB",
    region: "USA",
    streamCategory: "basketball",
    espn: { sport: "basketball", path: "mens-college-basketball", parser: "team" },
  },
  {
    id: "mlb",
    sport: "baseball",
    label: "MLB",
    short: "MLB",
    region: "USA",
    streamCategory: "baseball",
    espn: { sport: "baseball", path: "mlb", parser: "team" },
  },
  {
    id: "atp",
    sport: "tennis",
    label: "ATP Tour",
    short: "ATP",
    region: "INT",
    streamCategory: "tennis",
    espn: { sport: "tennis", path: "atp", parser: "tennis" },
  },
  {
    id: "wta",
    sport: "tennis",
    label: "WTA Tour",
    short: "WTA",
    region: "INT",
    streamCategory: "tennis",
    espn: { sport: "tennis", path: "wta", parser: "tennis" },
  },
] as const satisfies readonly LeagueRegistryEntry[];

export type League = (typeof LEAGUES)[number]["id"];
export type LeagueInfo = (typeof LEAGUES)[number];
export type SportInfo = (typeof SPORTS)[number];

export const LEAGUE_IDS = LEAGUES.map((league) => league.id) as League[];
const LEAGUE_ID_SET = new Set<string>(LEAGUE_IDS);

export const LEAGUE_BY_ID = LEAGUES.reduce<Record<League, LeagueInfo>>(
  (out, league) => {
    out[league.id] = league;
    return out;
  },
  Object.create(null),
);

export function isLeague(value: unknown): value is League {
  return typeof value === "string" && LEAGUE_ID_SET.has(value);
}

export function streamCategoryFor(league: League): StreamCategory {
  return LEAGUE_BY_ID[league].streamCategory;
}
