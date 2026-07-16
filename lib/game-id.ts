import type { League } from "./registry";
import { LEAGUE_IDS, isLeague } from "./registry";

const GAME_ID_SEPARATOR = "~";

for (const league of LEAGUE_IDS) {
  if (league.includes(GAME_ID_SEPARATOR)) {
    throw new Error(`League id cannot contain game id separator: ${league}`);
  }
}

export interface ParsedGameId {
  readonly league: League;
  readonly espnId: string;
}

export function makeGameId(league: League, espnId: string): string {
  return `${league}${GAME_ID_SEPARATOR}${espnId}`;
}

export function parseGameId(gameId: string): ParsedGameId | null {
  const separatorIndex = gameId.indexOf(GAME_ID_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const league = gameId.slice(0, separatorIndex);
  const espnId = gameId.slice(separatorIndex + GAME_ID_SEPARATOR.length);
  return espnId && isLeague(league) ? { league, espnId } : null;
}
