import type { League, Stream, Team } from "../types";

export interface StreamLookup {
  readonly id: string;
  readonly league: League;
  readonly eventName?: string;
  readonly shortName?: string;
  readonly homeTeam: Pick<Team, "name" | "abbreviation">;
  readonly awayTeam: Pick<Team, "name" | "abbreviation">;
}

export type StreamCountMap = Map<string, number>;

export type BootstrapStrategy = "none" | "wasm-lock" | "provider-token";

export interface EmbedHostRule {
  readonly hostname: string;
  readonly bootstrapStrategy: BootstrapStrategy;
}

export interface MediaHostRule {
  readonly hostname: string;
  readonly includeSubdomains?: boolean;
  readonly pathPrefix?: string;
}

export interface ProviderCapabilities {
  readonly embedHosts: readonly EmbedHostRule[];
  readonly mediaHosts?: readonly MediaHostRule[];
}

export interface Provider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  // Full stream list for one game (used by the watch panel). May fetch per-match detail.
  getStreams(game: StreamLookup, options?: StreamProviderOptions): Promise<Stream[]>;

  // Cheap availability counts for the feed badge. MUST read only cached list endpoints —
  // never per-match detail — so the home page stays at a handful of upstream calls.
  getCounts(games: readonly StreamLookup[], options?: StreamProviderOptions): Promise<StreamCountMap>;
}

export interface StreamProviderOptions {
  readonly signal?: AbortSignal;
}
