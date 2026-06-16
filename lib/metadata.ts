import type { League } from "./types";

export interface SportInfo {
  id: string;
  label: string;
}

export interface LeagueInfo {
  id: League;
  sport: string;
  label: string;
  short: string;
  region: string;
}

export const SPORTS: SportInfo[] = [
  { id: "basketball", label: "Basketball" },
  { id: "baseball", label: "Baseball" },
  { id: "tennis", label: "Tennis" },
];

export const LEAGUES: LeagueInfo[] = [
  { id: "nba",   sport: "basketball", label: "NBA",               short: "NBA",    region: "USA" },
  { id: "ncaab", sport: "basketball", label: "NCAA Men's",        short: "NCAAB",  region: "USA" },
  { id: "mlb",   sport: "baseball",   label: "MLB",               short: "MLB",    region: "USA" },
  { id: "atp",   sport: "tennis",     label: "ATP Tour",          short: "ATP",    region: "INT" },
  { id: "wta",   sport: "tennis",     label: "WTA Tour",          short: "WTA",    region: "INT" },
];

export const LEAGUE_BY_ID: Record<League, LeagueInfo> = Object.fromEntries(
  LEAGUES.map((l) => [l.id, l])
) as Record<League, LeagueInfo>;

export function isLeague(value: unknown): value is League {
  return typeof value === "string" && value in LEAGUE_BY_ID;
}

export function teamColor(abbr: string): string {
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  return `oklch(0.62 0.14 ${h % 360})`;
}
