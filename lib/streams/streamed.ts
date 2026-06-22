import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { buildGameMatcher, categoryFor } from "./match";

// streamed.pk — the original backend. A single "all-today" listing carries source
// references; each (source, id) pair is resolved to embed URLs via a per-source call.
//
// The streamed project rotates/loses domains, so we try its official mirrors in order
// (all serve byte-identical data). Add new mirrors here as the old ones go down.
const MIRRORS = ["https://streamed.pk/api", "https://streami.su/api", "https://streamed.st/api"];
const MAX_DETAIL_SOURCES = 8;
const DETAIL_CONCURRENCY = 3;

interface StreamedEvent {
  id: string;
  category: string;
  sources: { source: string; id: string }[];
}

interface StreamedStream {
  hd: boolean;
  embedUrl: string;
  language?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStreamedStream(value: unknown): value is StreamedStream {
  return isRecord(value)
    && typeof value.hd === "boolean"
    && typeof value.embedUrl === "string"
    && (value.language === undefined || typeof value.language === "string");
}

// Fetches `path` from the first mirror that answers OK.
async function fetchMirror(path: string, options?: StreamProviderOptions): Promise<Response | null> {
  const isDetail = path.startsWith("/stream/");
  const controllers = MIRRORS.map(() => new AbortController());
  try {
    const winner = await Promise.any(
      MIRRORS.map(async (base, index) => {
        const res = await fetchWithTimeout(`${base}${path}`, {
          signal: options?.signal
            ? AbortSignal.any([options.signal, controllers[index].signal])
            : controllers[index].signal,
          next: { revalidate: 60 },
          timeoutMs: isDetail ? STREAM_DETAIL_TIMEOUT_MS : STREAM_LIST_TIMEOUT_MS,
        });
        if (!res.ok) throw new Error(`streamed mirror ${base} returned ${res.status}`);
        return { index, res };
      }),
    );
    for (const [index, controller] of controllers.entries()) {
      if (index !== winner.index) controller.abort();
    }
    return winner.res;
  } catch {
    for (const controller of controllers) controller.abort();
    return null;
  }
}

async function fetchTodayEvents(options?: StreamProviderOptions): Promise<StreamedEvent[]> {
  const res = await fetchMirror("/matches/all-today", options);
  if (!res) return [];
  try {
    return await res.json();
  } catch {
    return [];
  }
}

function matchEvent(events: StreamedEvent[], game: StreamLookup): StreamedEvent | undefined {
  const category = categoryFor(game);
  const matcher = buildGameMatcher(game);
  return events.find((e) => e.category === category && matcher.test(e.id));
}

async function fetchSourceStreams(source: string, id: string, options?: StreamProviderOptions): Promise<StreamedStream[]> {
  const res = await fetchMirror(`/stream/${source}/${id}`, options);
  if (!res) return [];
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  const streams = Array.isArray(data) ? data : [data];
  return streams.filter(isStreamedStream);
}

async function fetchSourceGroups(
  sources: readonly { source: string; id: string }[],
  options?: StreamProviderOptions,
): Promise<StreamedStream[][]> {
  const groups: StreamedStream[][] = [];
  for (let i = 0; i < sources.length; i += DETAIL_CONCURRENCY) {
    if (options?.signal?.aborted) break;
    const batch = sources.slice(i, i + DETAIL_CONCURRENCY);
    groups.push(...await Promise.all(
      batch.map((source) => fetchSourceStreams(source.source, source.id, options)),
    ));
  }
  return groups;
}

export const streamed: Provider = {
  name: "streamed",
  capabilities: {
    embedHosts: [
      { hostname: "embed.st", bootstrapStrategy: "wasm-lock" },
      { hostname: "embedindia.st", bootstrapStrategy: "wasm-gasm" },
    ],
    mediaHosts: [
      { hostname: "strmd.st", includeSubdomains: true },
      { hostname: "tiktokcdn.com", includeSubdomains: true, pathPrefix: "/obj/" },
    ],
  },

  async getStreams(game, options) {
    const event = matchEvent(await fetchTodayEvents(options), game);
    if (!event) return [];

    // Dedup sources before fetching to avoid redundant requests.
    const seen = new Set<string>();
    const sources = event.sources.filter(({ source, id }) => {
      const key = `${source}:${id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_DETAIL_SOURCES);

    const groups = await fetchSourceGroups(sources, options);
    const out: Stream[] = [];
    for (const group of groups) {
      for (const s of group) {
        if (!s.hd || !s.embedUrl) continue;
        out.push({ label: "", url: s.embedUrl, quality: "HD", language: s.language || "EN" });
      }
    }
    return out;
  },

  async prefetch(options) {
    await fetchTodayEvents(options);
  },

  async getCounts(games, options) {
    const events = await fetchTodayEvents(options);
    // Bucket the all-today listing by category once, so each game scans only its
    // own category instead of the whole listing.
    const byCategory = new Map<string, StreamedEvent[]>();
    for (const event of events) {
      const bucket = byCategory.get(event.category);
      if (bucket) bucket.push(event);
      else byCategory.set(event.category, [event]);
    }
    return new Map(games.map((game) => {
      const matcher = buildGameMatcher(game);
      const event = byCategory.get(categoryFor(game))?.find((e) => matcher.test(e.id));
      return [game.id, event?.sources.length ?? 0];
    })) satisfies StreamCountMap;
  },
};
