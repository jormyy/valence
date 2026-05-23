import type { Game } from "./types";
import { LEAGUE_BY_ID } from "./metadata";

export function applyScope<T extends Game>(games: T[], sport: string, league: string | null): T[] {
  return games.filter((g) => {
    if (league) return g.league === league;
    if (sport === "live") return g.status === "in";
    if (sport === "upcoming") return g.status === "pre";
    if (sport !== "all") return LEAGUE_BY_ID[g.league]?.sport === sport;
    return true;
  });
}

export interface StatusCounts {
  live: number;
  upcoming: number;
  final: number;
  total: number;
}

export function statusCounts<T extends Game>(games: T[]): StatusCounts {
  let live = 0, upcoming = 0, final = 0;
  for (const g of games) {
    if (g.status === "in") live++;
    else if (g.status === "pre") upcoming++;
    else final++;
  }
  return { live, upcoming, final, total: games.length };
}
