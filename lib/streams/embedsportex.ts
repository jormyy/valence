import type { Stream } from "../types";
import { STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { buildGameMatcher, categoryFor } from "./match";

// EmbedSportex serves one JSON keyed by sport; each match carries its embeds inline
// (an `iframes` array), so no per-match detail call is needed. The project has
// rotated API domains, so try the current documented endpoint before the legacy one.
const URLS = [
  "https://api.esportex.site/api/streams",
  "https://api.embedsportex.site/api/streams",
];
const IFRAME_HOSTS = new Set([
  "embed.st",
  "embedindia.st",
  "embed.streamapi.cc",
  "streams.esportex.site",
]);
const CATEGORY_KEYS: Record<string, string> = {
  "american-football": "amfootball",
  "motor-sports": "race",
};
// Keep only player families that have been verified to resolve through our
// proxy to media URLs. Other ESX families return a 200 shell but often never
// reach a playable stream.
const SUPPORTED_PLAYER_PREFIXES = ["ehd/", "ppv/"];

interface EsxIframe {
  server?: string;
  url?: string;
}

export interface EsxMatch {
  slug?: string;
  tag?: string;
  kickoff?: string;
  endTime?: string;
  league?: string;
  iframes?: EsxIframe[];
}

export type EsxResponse = Record<string, EsxMatch[]>;

export async function fetchEmbedSportexListing(options?: StreamProviderOptions): Promise<EsxResponse> {
  for (const url of URLS) {
    try {
      const res = await fetchWithTimeout(url, {
        signal: options?.signal,
        next: { revalidate: 60 },
        timeoutMs: STREAM_LIST_TIMEOUT_MS,
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // Try the next known API domain.
    }
  }
  return {};
}

function findMatch(data: EsxResponse, game: StreamLookup): EsxMatch | undefined {
  const category = categoryFor(game);
  const arr = data[CATEGORY_KEYS[category] ?? category];
  if (!Array.isArray(arr)) return undefined;
  const matcher = buildGameMatcher(game);
  return arr.find((m) => matcher.test(m.tag ?? ""));
}

function countGames(data: EsxResponse, games: readonly StreamLookup[]): StreamCountMap {
  return new Map(games.map((game) => {
    const iframes = findMatch(data, game)?.iframes ?? [];
    return [game.id, iframes.filter((iframe) => isAllowedIframe(iframe.url)).length];
  }));
}

function quality(server?: string): Stream["quality"] {
  const s = (server ?? "").toUpperCase();
  if (s.includes("4K")) return "4K";
  if (s.startsWith("SD")) return "SD";
  return "HD";
}

function isAllowedIframe(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      IFRAME_HOSTS.has(url.hostname) &&
      isSupportedIframe(url);
  } catch {
    return false;
  }
}

function isSupportedIframe(url: URL): boolean {
  if (url.hostname !== "streams.esportex.site") return true;

  const decoded = decodePlayerHash(url.hash);
  return decoded ? SUPPORTED_PLAYER_PREFIXES.some((prefix) => decoded.startsWith(prefix)) : false;
}

function decodePlayerHash(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  try {
    return Buffer.from(decodeURIComponent(hash.slice(1)), "base64").toString("utf8");
  } catch {
    return null;
  }
}

export const embedsportex: Provider = {
  name: "embedsportex",
  capabilities: {
    embedHosts: [
      { hostname: "embed.st", bootstrapStrategy: "wasm-lock" },
      { hostname: "embedindia.st", bootstrapStrategy: "wasm-gasm" },
      { hostname: "embed.streamapi.cc", bootstrapStrategy: "wasm-lock" },
      { hostname: "streams.esportex.site", bootstrapStrategy: "none" },
      { hostname: "data.esportex.site", bootstrapStrategy: "none" },
      { hostname: "embedhd.org", bootstrapStrategy: "none" },
      { hostname: "exposestrat.com", bootstrapStrategy: "none" },
    ],
    mediaHosts: [
      { hostname: "indianservers.st", includeSubdomains: true, pathPrefix: "/secure/" },
      { hostname: "zohanayaan.com", includeSubdomains: true, pathPrefix: "/hls/" },
    ],
    playerScriptHosts: ["assets.embedindia.st"],
  },

  async getStreams(game, options) {
    const match = findMatch(await fetchEmbedSportexListing(options), game);
    if (!match?.iframes) return [];

    const out: Stream[] = [];
    for (const f of match.iframes) {
      if (!isAllowedIframe(f.url)) continue;
      out.push({ label: "", url: f.url, quality: quality(f.server), language: "EN" });
    }
    return out;
  },

  async prefetch(options) {
    await fetchEmbedSportexListing(options);
  },

  async getCounts(games, options) {
    return countGames(await fetchEmbedSportexListing(options), games);
  },
};
