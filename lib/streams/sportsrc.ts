import type { Stream } from "../types";
import { STREAM_DETAIL_TIMEOUT_MS, STREAM_LIST_TIMEOUT_MS, fetchWithTimeout } from "../upstream";
import type { Provider, StreamCountMap, StreamLookup, StreamProviderOptions } from "./types";
import { categoryFor, gameInText } from "./match";

// sportsrc.org is a streamed.pk-shaped mirror: a per-category match list, then a
// per-match `detail` call that returns the same {embedUrl, hd, language} sources
// (its embeds resolve through embed.streamapi.cc).
const BASE = "https://api.sportsrc.org";

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
  try {
    const res = await fetchWithTimeout(`${BASE}/?data=matches&category=${category}`, {
      signal: options?.signal,
      next: { revalidate: 60 },
      timeoutMs: STREAM_LIST_TIMEOUT_MS,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return [];
  }
}

function matchText(m: SportsrcMatch): string {
  return `${m.title ?? ""} ${m.teams?.home?.name ?? ""} ${m.teams?.away?.name ?? ""}`;
}

function findMatches(matches: SportsrcMatch[], game: StreamLookup): SportsrcMatch[] {
  return matches.filter((m) => gameInText(matchText(m), game));
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
  try {
    const res = await fetchWithTimeout(
      `${BASE}/?data=detail&category=${category}&id=${encodeURIComponent(id)}`,
      { signal: options?.signal, next: { revalidate: 60 }, timeoutMs: STREAM_DETAIL_TIMEOUT_MS },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.sources) ? json.data.sources : [];
  } catch {
    return [];
  }
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

    for (const match of matches) {
      const sources = await fetchDetail(category, match.id, options);
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
