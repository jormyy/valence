import { dateInPT } from "./datetime";
import type { LeagueDisplay } from "./registry";
import type { GameWithStreams } from "./types";

export const GAME_BOOTSTRAP_TTL_MS = 60_000;

export interface GameBootstrap {
  readonly games: GameWithStreams[];
  readonly leagueDisplay: LeagueDisplay[];
  readonly date: string;
  readonly loadedAt: number;
}

export function isGameBootstrapFresh(bootstrap: GameBootstrap, now = Date.now()): boolean {
  const age = now - bootstrap.loadedAt;
  return Number.isFinite(bootstrap.loadedAt)
    && age >= 0
    && age < GAME_BOOTSTRAP_TTL_MS
    && bootstrap.date === dateInPT(now);
}
