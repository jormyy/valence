import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { buildGameMatcher, categoryFor } from "./match";
import { AsyncTtlCache } from "../async-ttl-cache";
import { fetchWithValidatedRedirects } from "../validated-redirect";

// ppv.land's public backend. The ppv.land front-end is mid-relaunch ("Coming Soon"),
// but api.ppv.to is live: a listing groups events under named categories, and each
// event's iframe comes from a per-id detail call (sources[].type === "iframe").
// Its category names match the shared sport buckets (basketball/baseball/tennis).
const BASE = "https://api.ppv.to/api";
const listingCache = new AsyncTtlCache<string, PpvCategory[]>(60_000, 1);
const sourceCache = new AsyncTtlCache<number, PpvSource[]>(60_000, 64);

export interface PpvEvent {
  id: number;
  name?: string;
  tag?: string;
  category_name?: string;
  uri_name?: string;
  starts_at?: number;
  ends_at?: number;
  always_live?: number;
  locale?: string;
  iframe?: string;
  substreams?: PpvSubstream[];
}

export interface PpvCategory {
  category?: string;
  streams?: PpvEvent[];
}

interface PpvSubstream {
  name?: string;
  iframe?: string;
}

interface PpvSource {
  type?: string;
  data?: string;
}

export function fetchPpvListing(options?: StreamProviderOptions): Promise<PpvCategory[]> {
  return listingCache.get("listing", async (signal) => {
    try {
      const res = await fetchWithValidatedRedirects(`${BASE}/streams`, (url) => url.href.startsWith(`${BASE}/`), {
        signal,
        cache: "no-store",
        timeoutMs: STREAM_LIST_TIMEOUT_MS,
      }, fetchWithTimeout);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.streams) ? json.streams : [];
    } catch {
      return [];
    }
  }, options?.signal);
}

export function ppvCategoryKey(value: string): string {
  const normalized = value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  switch (normalized) {
    case "american-football":
      return "american-football";
    case "australian-football":
      return "afl";
    case "football":
      return "football";
    case "ufc-boxing":
    case "mma":
    case "boxing":
    case "wrestling":
      return "fight";
    case "motor-sports":
    case "motorsports":
    case "racing":
      return "motor-sports";
    default:
      return normalized;
  }
}

function findEvent(listing: PpvCategory[], game: StreamLookup): PpvEvent | undefined {
  const want = categoryFor(game);
  const matcher = buildGameMatcher(game);
  for (const cat of listing) {
    const category = ppvCategoryKey(cat.category ?? "");
    if (category !== want && !(want === "motor-sports" && category === "24-7-streams")) continue;
    for (const ev of cat.streams ?? []) {
      if (matcher.test(ev.name ?? "")) return ev;
    }
  }
  return undefined;
}

async function fetchSources(id: number, options?: StreamProviderOptions): Promise<PpvSource[]> {
  return sourceCache.get(id, async (signal) => {
    try {
      const res = await fetchWithValidatedRedirects(`${BASE}/streams/${id}`, (url) => url.href.startsWith(`${BASE}/`), {
        signal,
        cache: "no-store",
        timeoutMs: STREAM_DETAIL_TIMEOUT_MS,
      }, fetchWithTimeout);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data?.sources) ? json.data.sources : [];
    } catch {
      return [];
    }
  }, options?.signal);
}

function isAllowedIframe(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (
      url.hostname === "embed.st"
      || url.hostname === "embed.streamapi.cc"
    );
  } catch {
    return false;
  }
}

function listingStreams(event: PpvEvent): Stream[] {
  const out: Stream[] = [];
  if (isAllowedIframe(event.iframe)) {
    out.push({ label: "", url: event.iframe, quality: "HD", language: "EN" });
  }
  for (const substream of event.substreams ?? []) {
    if (!isAllowedIframe(substream.iframe)) continue;
    out.push({
      label: "",
      url: substream.iframe,
      quality: "HD",
      language: substream.name || "EN",
    });
  }
  return out;
}

export function hasPpvListingStream(event: PpvEvent): boolean {
  return listingStreams(event).length > 0;
}

export const ppv: Provider = {
  name: "ppv",
  capabilities: {
    embedHosts: [
      { hostname: "embed.st", bootstrapStrategy: "wasm-lock" },
      { hostname: "embed.streamapi.cc", bootstrapStrategy: "wasm-lock" },
    ],
  },

  async getStreams(game, options) {
    const event = findEvent(await fetchPpvListing(options), game);
    if (!event) return [];

    const direct = listingStreams(event);
    if (direct.length > 0) return direct;

    const sources = await fetchSources(event.id, options);
    const out: Stream[] = [];
    for (const s of sources) {
      if (s.type !== "iframe" || !isAllowedIframe(s.data)) continue;
      out.push({ label: "", url: s.data, quality: "HD", language: "EN" });
    }
    return out;
  },

  async prefetch(options) {
    await fetchPpvListing(options);
  },

  async getCounts(games, options) {
    const listing = await fetchPpvListing(options);
    return new Map(games.map((game) => {
      const event = findEvent(listing, game);
      if (!event) return [game.id, 0];
      const count = listingStreams(event).length;
      return [game.id, count];
    })) satisfies StreamCountMap;
  },
};
