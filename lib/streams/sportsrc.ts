import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { buildGameMatcher, categoryFor } from "./match";
import { AsyncTtlCache } from "../async-ttl-cache";
import { fetchWithValidatedRedirects } from "../validated-redirect";

// sportsrc.org is a streamed.pk-shaped mirror: a per-category match list, then a
// per-match `detail` call that returns the same {embedUrl, hd, language} sources
// (its embeds resolve through embed.streamapi.cc).
const BASE = "https://api.sportsrc.org";
const matchCache = new AsyncTtlCache<string, SportsrcMatch[]>(60_000, 16);
const detailCache = new AsyncTtlCache<string, SportsrcSource[]>(60_000, 64);

interface SportsrcMatch {
  id: string;
  title?: string;
  teams?: { home?: { name?: string }; away?: { name?: string } };
}

interface SportsrcSource {
  embedUrl?: string;
  hd?: boolean;
  language?: string;
}

async function fetchMatches(category: string, options?: StreamProviderOptions): Promise<SportsrcMatch[]> {
  return matchCache.get(category, async (signal) => {
    try {
      const res = await fetchWithValidatedRedirects(`${BASE}/?data=matches&category=${category}`, (url) => url.origin === BASE, {
        signal,
        cache: "no-store",
        timeoutMs: STREAM_LIST_TIMEOUT_MS,
      }, fetchWithTimeout);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch {
      return [];
    }
  }, options?.signal);
}

function matchText(m: SportsrcMatch): string {
  return `${m.title ?? ""} ${m.teams?.home?.name ?? ""} ${m.teams?.away?.name ?? ""}`;
}

function findMatches(matches: SportsrcMatch[], game: StreamLookup): SportsrcMatch[] {
  const matcher = buildGameMatcher(game);
  return matches.filter((m) => matcher.test(matchText(m)));
}

async function fetchMatchesByCategory(
  games: readonly StreamLookup[],
  options?: StreamProviderOptions,
): Promise<Map<string, SportsrcMatch[]>> {
  const categories = [...new Set(games.map(categoryFor))];
  const entries = await Promise.all(
    categories.map(async (category) => [category, await fetchMatches(category, options)] as const),
  );
  return new Map(entries);
}

async function fetchDetail(category: string, id: string, options?: StreamProviderOptions): Promise<SportsrcSource[]> {
  const key = `${category}:${id}`;
  return detailCache.get(key, async (signal) => {
    try {
      const res = await fetchWithValidatedRedirects(
        `${BASE}/?data=detail&category=${category}&id=${encodeURIComponent(id)}`,
        (url) => url.origin === BASE,
        { signal, cache: "no-store", timeoutMs: STREAM_DETAIL_TIMEOUT_MS },
        fetchWithTimeout,
      );
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data?.sources) ? json.data.sources : [];
    } catch {
      return [];
    }
  }, options?.signal);
}

export const sportsrc: Provider = {
  name: "sportsrc",
  capabilities: {
    embedHosts: [
      { hostname: "embed.streamapi.cc", bootstrapStrategy: "wasm-lock" },
    ],
  },

  async getStreams(game, options) {
    const category = categoryFor(game);
    const matches = findMatches(await fetchMatches(category, options), game);

    // Fetch candidate details in parallel, then return the first non-empty in match
    // order — avoids serializing N detail timeouts when a game fuzzy-matches several.
    const groups = await Promise.all(
      matches.map((match) => fetchDetail(category, match.id, options)),
    );
    for (const sources of groups) {
      const out: Stream[] = [];
      for (const s of sources) {
        if (!s.embedUrl) continue;
        out.push({
          label: "",
          url: s.embedUrl,
          quality: s.hd === false ? "SD" : "HD",
          language: s.language || "EN",
        });
      }
      if (out.length > 0) return out;
    }

    return [];
  },

  async getCounts(games, options) {
    const matchesByCategory = await fetchMatchesByCategory(games, options);
    return new Map(
      games.map((game) => {
        const category = categoryFor(game);
        return [game.id, findMatches(matchesByCategory.get(category) ?? [], game).length > 0 ? 1 : 0];
      }),
    ) satisfies StreamCountMap;
  },
};
