export const SPORTS = [
  { id: "sports", label: "Sports" },
  { id: "basketball", label: "Basketball" },
  { id: "baseball", label: "Baseball" },
  { id: "american-football", label: "Football" },
  { id: "hockey", label: "Hockey" },
  { id: "soccer", label: "Soccer" },
  { id: "tennis", label: "Tennis" },
  { id: "combat", label: "Combat" },
  { id: "aussie-rules", label: "Aussie Rules" },
  { id: "rugby", label: "Rugby" },
  { id: "volleyball", label: "Volleyball" },
  { id: "cricket", label: "Cricket" },
  { id: "racing", label: "Racing" },
  { id: "golf", label: "Golf" },
] as const;

export type Sport = (typeof SPORTS)[number]["id"];
export const STREAM_CATEGORIES = [
  "sports",
  "basketball",
  "baseball",
  "tennis",
  "american-football",
  "hockey",
  "football",
  "fight",
  "afl",
  "rugby",
  "volleyball",
  "cricket",
  "motor-sports",
  "golf",
] as const;
export type StreamCategory = (typeof STREAM_CATEGORIES)[number];
export type EspnParser = "team" | "tennis" | "event";

export type EspnSchedule = {
  readonly sport: string;
  readonly path: string;
  readonly parser: EspnParser;
};

type LeagueRegistryEntry = {
  readonly id: string;
  readonly sport: Sport;
  readonly label: string;
  readonly short: string;
  readonly region: string;
  readonly streamCategory: StreamCategory;
  readonly espn?: EspnSchedule;
};

export const LEAGUES = [
  {
    id: "sports-channels",
    sport: "sports",
    label: "Sports Channels",
    short: "SPORTS",
    region: "INT",
    streamCategory: "sports",
  },
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
    id: "wnba",
    sport: "basketball",
    label: "WNBA",
    short: "WNBA",
    region: "USA",
    streamCategory: "basketball",
    espn: { sport: "basketball", path: "wnba", parser: "team" },
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
    id: "basketball-events",
    sport: "basketball",
    label: "Basketball Channels",
    short: "HOOPS",
    region: "INT",
    streamCategory: "basketball",
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
    id: "nfl",
    sport: "american-football",
    label: "NFL",
    short: "NFL",
    region: "USA",
    streamCategory: "american-football",
    espn: { sport: "football", path: "nfl", parser: "team" },
  },
  {
    id: "ncaaf",
    sport: "american-football",
    label: "NCAA Football",
    short: "NCAAF",
    region: "USA",
    streamCategory: "american-football",
    espn: { sport: "football", path: "college-football", parser: "team" },
  },
  {
    id: "nhl",
    sport: "hockey",
    label: "NHL",
    short: "NHL",
    region: "USA/CAN",
    streamCategory: "hockey",
    espn: { sport: "hockey", path: "nhl", parser: "team" },
  },
  {
    id: "mls",
    sport: "soccer",
    label: "MLS",
    short: "MLS",
    region: "USA/CAN",
    streamCategory: "football",
    espn: { sport: "soccer", path: "usa.1", parser: "team" },
  },
  {
    id: "nwsl",
    sport: "soccer",
    label: "NWSL",
    short: "NWSL",
    region: "USA",
    streamCategory: "football",
    espn: { sport: "soccer", path: "usa.nwsl", parser: "team" },
  },
  {
    id: "epl",
    sport: "soccer",
    label: "Premier League",
    short: "EPL",
    region: "ENG",
    streamCategory: "football",
    espn: { sport: "soccer", path: "eng.1", parser: "team" },
  },
  {
    id: "laliga",
    sport: "soccer",
    label: "LaLiga",
    short: "LALIGA",
    region: "ESP",
    streamCategory: "football",
    espn: { sport: "soccer", path: "esp.1", parser: "team" },
  },
  {
    id: "serie-a",
    sport: "soccer",
    label: "Serie A",
    short: "SERIE A",
    region: "ITA",
    streamCategory: "football",
    espn: { sport: "soccer", path: "ita.1", parser: "team" },
  },
  {
    id: "bundesliga",
    sport: "soccer",
    label: "Bundesliga",
    short: "BUN",
    region: "GER",
    streamCategory: "football",
    espn: { sport: "soccer", path: "ger.1", parser: "team" },
  },
  {
    id: "ligue-1",
    sport: "soccer",
    label: "Ligue 1",
    short: "LIGUE 1",
    region: "FRA",
    streamCategory: "football",
    espn: { sport: "soccer", path: "fra.1", parser: "team" },
  },
  {
    id: "liga-mx",
    sport: "soccer",
    label: "Liga MX",
    short: "LIGA MX",
    region: "MEX",
    streamCategory: "football",
    espn: { sport: "soccer", path: "mex.1", parser: "team" },
  },
  {
    id: "ucl",
    sport: "soccer",
    label: "UEFA Champions League",
    short: "UCL",
    region: "EUR",
    streamCategory: "football",
    espn: { sport: "soccer", path: "uefa.champions", parser: "team" },
  },
  {
    id: "uel",
    sport: "soccer",
    label: "UEFA Europa League",
    short: "UEL",
    region: "EUR",
    streamCategory: "football",
    espn: { sport: "soccer", path: "uefa.europa", parser: "team" },
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
  {
    id: "tennis-events",
    sport: "tennis",
    label: "Tennis Channels",
    short: "TENNIS",
    region: "INT",
    streamCategory: "tennis",
  },
  {
    id: "ufc",
    sport: "combat",
    label: "UFC",
    short: "UFC",
    region: "INT",
    streamCategory: "fight",
    espn: { sport: "mma", path: "ufc", parser: "event" },
  },
  {
    id: "afl",
    sport: "aussie-rules",
    label: "AFL",
    short: "AFL",
    region: "AUS",
    streamCategory: "afl",
    espn: { sport: "australian-football", path: "afl", parser: "team" },
  },
  {
    id: "world-football",
    sport: "soccer",
    label: "International Football",
    short: "INTL",
    region: "INT",
    streamCategory: "football",
  },
  {
    id: "gridiron",
    sport: "american-football",
    label: "CFL / ELF",
    short: "CFL/ELF",
    region: "INT",
    streamCategory: "american-football",
  },
  {
    id: "rugby",
    sport: "rugby",
    label: "Rugby",
    short: "RUGBY",
    region: "INT",
    streamCategory: "rugby",
  },
  {
    id: "volleyball",
    sport: "volleyball",
    label: "Volleyball",
    short: "VB",
    region: "INT",
    streamCategory: "volleyball",
  },
  {
    id: "cricket",
    sport: "cricket",
    label: "Cricket",
    short: "CRICKET",
    region: "INT",
    streamCategory: "cricket",
  },
  {
    id: "wrestling",
    sport: "combat",
    label: "Pro Wrestling",
    short: "WREST",
    region: "INT",
    streamCategory: "fight",
  },
  {
    id: "combat-events",
    sport: "combat",
    label: "Combat Events",
    short: "FIGHT",
    region: "INT",
    streamCategory: "fight",
  },
  {
    id: "motorsports",
    sport: "racing",
    label: "Motor Sports",
    short: "MOTOR",
    region: "INT",
    streamCategory: "motor-sports",
  },
  {
    id: "f1",
    sport: "racing",
    label: "Formula 1",
    short: "F1",
    region: "INT",
    streamCategory: "motor-sports",
    espn: { sport: "racing", path: "f1", parser: "event" },
  },
  {
    id: "pga",
    sport: "golf",
    label: "PGA Tour",
    short: "PGA",
    region: "INT",
    streamCategory: "golf",
    espn: { sport: "golf", path: "pga", parser: "event" },
  },
] as const satisfies readonly LeagueRegistryEntry[];

export type League = (typeof LEAGUES)[number]["id"];
export type LeagueInfo = LeagueRegistryEntry & { readonly id: League };
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

export function hasEspnSchedule(league: LeagueInfo): league is LeagueInfo & { readonly espn: EspnSchedule } {
  return Boolean(league.espn);
}
