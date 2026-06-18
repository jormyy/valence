import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { categoryFor, gameInText } from "./match";

// ppv.land's public backend. The ppv.land front-end is mid-relaunch ("Coming Soon"),
// but api.ppv.to is live: a listing groups events under named categories, and each
// event's iframe comes from a per-id detail call (sources[].type === "iframe").
// Its category names match the shared sport buckets (basketball/baseball/tennis).
const BASE = "https://api.ppv.to/api";

interface PpvEvent {
  id: number;
  name?: string;
}

interface PpvCategory {
  category?: string;
  streams?: PpvEvent[];
}

interface PpvSource {
  type?: string;
  data?: string;
}

async function fetchListing(options?: StreamProviderOptions): Promise<PpvCategory[]> {
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

function findEvent(listing: PpvCategory[], game: StreamLookup): PpvEvent | undefined {
  const want = categoryFor(game);
  for (const cat of listing) {
    if ((cat.category ?? "").toLowerCase() !== want) continue;
    for (const ev of cat.streams ?? []) {
      if (gameInText(ev.name ?? "", game)) return ev;
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

export const ppv: Provider = {
  name: "ppv",
  capabilities: {
    embedHosts: [
      { hostname: "embed.st", bootstrapStrategy: "wasm-lock" },
      { hostname: "embedindia.st", bootstrapStrategy: "provider-token" },
      { hostname: "embed.streamapi.cc", bootstrapStrategy: "wasm-lock" },
    ],
  },

  async getStreams(game, options) {
    const event = findEvent(await fetchListing(options), game);
    if (!event) return [];

    const sources = await fetchSources(event.id, options);
    const out: Stream[] = [];
    for (const s of sources) {
      if (s.type !== "iframe" || !s.data) continue;
      out.push({ label: "", url: s.data, quality: "HD", language: "EN" });
    }
    return out;
  },

  async getCounts(games, options) {
    const listing = await fetchListing(options);
    return new Map(games.map((game) => [game.id, findEvent(listing, game) ? 1 : 0])) satisfies StreamCountMap;
  },
};
