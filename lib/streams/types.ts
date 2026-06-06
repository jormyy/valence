import type { Game, Stream } from "../types";

export interface Provider {
  readonly name: string;

  // Full stream list for one game (used by the watch panel). May fetch per-match detail.
  getStreams(game: Game): Promise<Stream[]>;

  // Cheap availability count for the feed badge. MUST read only cached list endpoints —
  // never per-match detail — so the home page stays at a handful of upstream calls
  // regardless of how many games are on the schedule.
  getCount(game: Game): Promise<number>;
}
