import type { Game } from "./types";
import type { Sport } from "./registry";
import { LEAGUE_BY_ID } from "./registry";

export type SportScope = "all" | Sport;
export type StatusFilter = "all" | "live" | "upcoming" | "final";

export function applyScope<T extends Game>(games: T[], sport: SportScope, league: Game["league"] | null): T[] {
  return games.filter((g) => {
    if (league) return g.league === league;
    if (sport !== "all") return LEAGUE_BY_ID[g.league]?.sport === sport;
    return true;
  });
}

export function applyStatusFilter<T extends Game>(games: T[], status: StatusFilter): T[] {
  if (status === "live") return games.filter((g) => g.status === "in");
  if (status === "upcoming") return games.filter((g) => g.status === "pre");
  if (status === "final") return games.filter((g) => g.status === "post");
  return games;
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
