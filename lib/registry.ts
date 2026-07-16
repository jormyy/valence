import { LEAGUES } from "./registry-data";
import { SPORTS } from "./sports";
import type { Sport } from "./sports";
export { LEAGUES };
export { SPORTS };
export type { Sport } from "./sports";
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
export type LeagueDisplay = Pick<LeagueInfo, "id" | "sport" | "label" | "short" | "region"> & {
  readonly scheduled: boolean;
};
export type LeagueDisplayMap = Readonly<Partial<Record<League, LeagueDisplay>>>;

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

export function leagueDisplayForGames(
  games: readonly { readonly league: League }[],
): LeagueDisplay[] {
  const active = new Set(games.map((game) => game.league));
  return LEAGUES
    .filter((league) => active.has(league.id))
    .map((league) => ({
      id: league.id,
      sport: league.sport,
      label: league.label,
      short: league.short,
      region: league.region,
      scheduled: "espn" in league,
    }));
}
