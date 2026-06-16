import type { Game, GameWithStreams, Stream } from "../types";
import type { Provider, StreamCountMap, StreamLookup } from "./types";
import { streamed } from "./streamed";
import { sportsrc } from "./sportsrc";
import { embedsportex } from "./embedsportex";
import { ppv } from "./ppv";

// Every active stream backend. streamed.pk is the original; the rest are additional free,
// public APIs that the popular front-ends (StreamEast, Sportsurge, Crackstreams, …) also
// embed from. Order matters: streamed's HD sources stay first in the watch panel.
//
// topembed.pw is intentionally omitted — it sits behind Cloudflare and answers server-side
// requests with a JS challenge (not JSON), so it can't be fetched from a Next.js route.
// ppv.land's own domain is mid-relaunch; we hit its live backend (api.ppv.to) directly.
const PROVIDERS: Provider[] = [streamed, sportsrc, embedsportex, ppv];

// Runs a provider call, swallowing failures so one bad backend never breaks the rest.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getStreams(game: StreamLookup): Promise<Stream[]> {
  const groups = await Promise.all(
    PROVIDERS.map((p) => safe(() => p.getStreams(game), [])),
  );

  // Pool every provider's streams into one list, deduped by embed URL. Labels are assigned
  // after dedup so they read "HD 1 / HD 2 / SD 3 …" across the merged set.
  const out: Stream[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const s of group) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push({ ...s, label: `${s.quality} ${out.length + 1}` });
    }
  }
  return out;
}

// Summed availability across providers — a rough "how many sources" badge for the feed.
// Counts may overlap (we can't dedup without fetching embed URLs), which is fine for a badge.
function zeroCounts(games: readonly StreamLookup[]): StreamCountMap {
  return new Map(games.map((g) => [g.id, 0]));
}

export async function getStreamCounts(games: readonly StreamLookup[]): Promise<StreamCountMap> {
  if (games.length === 0) return zeroCounts(games);

  const providerCounts = await Promise.all(
    PROVIDERS.map((p) => safe(() => p.getCounts(games), zeroCounts(games))),
  );
  const totals = zeroCounts(games);
  for (const counts of providerCounts) {
    for (const game of games) {
      totals.set(game.id, (totals.get(game.id) ?? 0) + (counts.get(game.id) ?? 0));
    }
  }
  return totals;
}

// The aggregated backends only carry today's events; skip the fetch for other dates.
export async function attachStreamCounts(
  games: Game[],
  dateStr?: string,
): Promise<GameWithStreams[]> {
  const counts = dateStr
    ? zeroCounts(games)
    : await getStreamCounts(games);
  return games.map((g) => ({ ...g, streamCount: counts.get(g.id) ?? 0 }));
}
