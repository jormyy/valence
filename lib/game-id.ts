import type { League } from "./registry";
import { LEAGUE_IDS, isLeague } from "./registry";

const GAME_ID_SEPARATOR = "~";
const LEGACY_GAME_ID_SEPARATOR = "-";

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
  if (separatorIndex > 0) {
    const league = gameId.slice(0, separatorIndex);
    const espnId = gameId.slice(separatorIndex + GAME_ID_SEPARATOR.length);
    if (espnId && isLeague(league)) return { league, espnId };
    return null;
  }

  const matches = LEAGUE_IDS.filter((league) => (
    gameId.startsWith(`${league}${LEGACY_GAME_ID_SEPARATOR}`)
  ));
  if (matches.length === 1) {
    const league = matches[0];
    return { league, espnId: gameId.slice(league.length + LEGACY_GAME_ID_SEPARATOR.length) };
  }

  return null;
}
