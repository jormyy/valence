import type { Game, Stream } from "../types";
import type { Provider } from "./types";
import { LEAGUE_SPORT, gameInText } from "./match";

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

async function fetchMatches(category: string): Promise<SportsrcMatch[]> {
  try {
    const res = await fetch(`${BASE}/?data=matches&category=${category}`, {
      next: { revalidate: 60 },
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

function findMatch(matches: SportsrcMatch[], game: Game): SportsrcMatch | undefined {
  return matches.find((m) => gameInText(matchText(m), game));
}

async function fetchDetail(category: string, id: string): Promise<SportsrcSource[]> {
  try {
    const res = await fetch(
      `${BASE}/?data=detail&category=${category}&id=${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } },
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

  async getStreams(game) {
    const category = LEAGUE_SPORT[game.league];
    const match = findMatch(await fetchMatches(category), game);
    if (!match) return [];

    const sources = await fetchDetail(category, match.id);
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
    return out;
  },

  async getCount(game) {
    const category = LEAGUE_SPORT[game.league];
    return findMatch(await fetchMatches(category), game) ? 1 : 0;
  },
};
