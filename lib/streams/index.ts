import type { Game, GameWithStreams, Stream } from "../types";
import type { Provider } from "./types";
import { youtube } from "./youtube";
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
// youtube is first so a CLEAN (non-Adcash) stream, when one exists for a game, becomes the default
// tab — a plain click plays it with zero pop-ups. The streamed.pk family (Adcash) follows.
const PROVIDERS: Provider[] = [youtube, streamed, sportsrc, embedsportex, ppv];

// Runs a provider call, swallowing failures so one bad backend never breaks the rest.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getStreams(game: Game): Promise<Stream[]> {
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
export async function getStreamCount(game: Game): Promise<number> {
  const counts = await Promise.all(PROVIDERS.map((p) => safe(() => p.getCount(game), 0)));
  return counts.reduce((sum, n) => sum + n, 0);
}

// The aggregated backends only carry today's events; skip the fetch for other dates.
export async function attachStreamCounts(
  games: Game[],
  dateStr?: string,
): Promise<GameWithStreams[]> {
  const counts = dateStr
    ? games.map(() => 0)
    : await Promise.all(games.map((g) => getStreamCount(g)));
  return games.map((g, i) => ({ ...g, streamCount: counts[i] }));
}
