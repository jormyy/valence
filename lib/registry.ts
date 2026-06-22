import { LEAGUES } from "./registry-data";
export { LEAGUES };

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

export type LeagueRegistryEntry = {
  readonly id: string;
  readonly sport: Sport;
  readonly label: string;
  readonly short: string;
  readonly region: string;
  readonly streamCategory: StreamCategory;
  readonly espn?: EspnSchedule;
};

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
