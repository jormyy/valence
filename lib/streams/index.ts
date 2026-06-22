import type { Game, GameWithStreams, Stream } from "../types";
import { normalizeDate, todayInPT, dayNumber } from "../datetime";
import type { StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { PROVIDERS } from "./providers";
import { rankStreamsByHealth } from "./health";

// Runs a provider call, swallowing failures so one bad backend never breaks the rest.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getStreams(game: StreamLookup, options?: StreamProviderOptions): Promise<Stream[]> {
  const groups = await Promise.all(
    PROVIDERS.map((p) => safe(() => p.getStreams(game, options), [])),
  );

  // Pool every provider's streams into one list, deduped by embed URL. Health is checked
  // globally so every sport/provider gets reachable sources before dead mirrors.
  const out: Stream[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const s of group) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
  }

  const ranked = await rankStreamsByHealth(out, options);
  return ranked.map((stream, index) => ({
    ...stream,
    label: `${stream.quality} ${index + 1}`,
  }));
}

// Summed availability across providers — a rough "how many sources" badge for the feed.
// Counts may overlap (we can't dedup without fetching embed URLs), which is fine for a badge.
function zeroCounts(games: readonly StreamLookup[]): StreamCountMap {
  return new Map(games.map((g) => [g.id, 0]));
}

// Shared read-only fallback for a failed provider — the merge below starts from a
// zero baseline and defaults missing ids to 0, so a failed provider contributes
// nothing. Avoids allocating a full zeroCounts map per provider on every call.
const EMPTY_COUNTS: StreamCountMap = new Map();

export async function getStreamCounts(
  games: readonly StreamLookup[],
  options?: StreamProviderOptions,
): Promise<StreamCountMap> {
  if (games.length === 0) return zeroCounts(games);

  const providerCounts = await Promise.all(
    PROVIDERS.map((p) => safe(() => p.getCounts(games, options), EMPTY_COUNTS)),
  );
  const totals = zeroCounts(games);
  for (const counts of providerCounts) {
    for (const [id, n] of counts) {
      totals.set(id, (totals.get(id) ?? 0) + n);
    }
  }
  return totals;
}

// The UI only exposes yesterday/today/tomorrow. The providers often list nearby
// upcoming events too, but not arbitrary historical schedules.
function shouldFetchStreamCounts(dateStr?: string): boolean {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return false;
  return Math.abs(dayNumber(normalized) - dayNumber(todayInPT())) <= 1;
}

// Kick off providers' game-independent listing fetches so they overlap with the ESPN
// scoreboard fan-out instead of running after it. Gated by the same window as
// attachStreamCounts so we never warm a cache the counts pass won't use. Purely
// additive: the counts themselves are still computed in attachStreamCounts.
export function prefetchStreamCounts(dateStr?: string, options?: StreamProviderOptions): Promise<unknown> {
  if (!shouldFetchStreamCounts(dateStr)) return Promise.resolve();
  return Promise.all(PROVIDERS.map((p) => p.prefetch?.(options)?.catch(() => undefined)));
}

export async function attachStreamCounts(
  games: Game[],
  dateStr?: string,
  options?: StreamProviderOptions,
): Promise<GameWithStreams[]> {
  const counts = shouldFetchStreamCounts(dateStr) ? await getStreamCounts(games, options) : zeroCounts(games);
  return games.map((g) => ({ ...g, streamCount: counts.get(g.id) ?? 0 }));
}
