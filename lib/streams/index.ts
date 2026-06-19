import type { Game, GameWithStreams, Stream } from "../types";
import { normalizeEspnDate, todayInPT } from "../espn";
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

export async function getStreamCounts(
  games: readonly StreamLookup[],
  options?: StreamProviderOptions,
): Promise<StreamCountMap> {
  if (games.length === 0) return zeroCounts(games);

  const providerCounts = await Promise.all(
    PROVIDERS.map((p) => safe(() => p.getCounts(games, options), zeroCounts(games))),
  );
  const totals = zeroCounts(games);
  for (const counts of providerCounts) {
    for (const game of games) {
      totals.set(game.id, (totals.get(game.id) ?? 0) + (counts.get(game.id) ?? 0));
    }
  }
  return totals;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

// The UI only exposes yesterday/today/tomorrow. The providers often list nearby
// upcoming events too, but not arbitrary historical schedules.
function shouldFetchStreamCounts(dateStr?: string): boolean {
  const normalized = normalizeEspnDate(dateStr);
  if (!normalized) return false;
  return Math.abs(dayNumber(normalized) - dayNumber(todayInPT())) <= 1;
}

export async function attachStreamCounts(
  games: Game[],
  dateStr?: string,
  options?: StreamProviderOptions,
): Promise<GameWithStreams[]> {
  const counts = shouldFetchStreamCounts(dateStr) ? await getStreamCounts(games, options) : zeroCounts(games);
  return games.map((g) => ({ ...g, streamCount: counts.get(g.id) ?? 0 }));
}
