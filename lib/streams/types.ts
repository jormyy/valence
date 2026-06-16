import type { League, Stream, Team } from "../types";

export interface StreamLookup {
  readonly id: string;
  readonly league: League;
  readonly homeTeam: Pick<Team, "name" | "abbreviation">;
  readonly awayTeam: Pick<Team, "name" | "abbreviation">;
}

export type StreamCountMap = Map<string, number>;

export interface Provider {
  readonly name: string;

  // Full stream list for one game (used by the watch panel). May fetch per-match detail.
  getStreams(game: StreamLookup): Promise<Stream[]>;

  // Cheap availability counts for the feed badge. MUST read only cached list endpoints —
  // never per-match detail — so the home page stays at a handful of upstream calls.
  getCounts(games: readonly StreamLookup[]): Promise<StreamCountMap>;
}
