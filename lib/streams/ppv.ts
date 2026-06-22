import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { buildGameMatcher, categoryFor } from "./match";

// ppv.land's public backend. The ppv.land front-end is mid-relaunch ("Coming Soon"),
// but api.ppv.to is live: a listing groups events under named categories, and each
// event's iframe comes from a per-id detail call (sources[].type === "iframe").
// Its category names match the shared sport buckets (basketball/baseball/tennis).
const BASE = "https://api.ppv.to/api";

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

export async function fetchPpvListing(options?: StreamProviderOptions): Promise<PpvCategory[]> {
  try {
    const res = await fetchWithTimeout(`${BASE}/streams`, {
      signal: options?.signal,
      next: { revalidate: 60 },
      timeoutMs: STREAM_LIST_TIMEOUT_MS,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.streams) ? json.streams : [];
  } catch {
    return [];
  }
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
  try {
    const res = await fetchWithTimeout(`${BASE}/streams/${id}`, {
      signal: options?.signal,
      next: { revalidate: 60 },
      timeoutMs: STREAM_DETAIL_TIMEOUT_MS,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.sources) ? json.data.sources : [];
  } catch {
    return [];
  }
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
