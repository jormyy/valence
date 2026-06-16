import type { Stream } from "../types";
import type { Provider, StreamCountMap, StreamLookup } from "./types";
import { LEAGUE_SPORT, gameInText } from "./match";

// embedsportex.site serves one JSON keyed by sport; each match carries its embeds inline
// (an `iframes` array), so no per-match detail call is needed.
const URL = "https://api.embedsportex.site/api/streams";

interface EsxIframe {
  server?: string;
  url?: string;
}

interface EsxMatch {
  tag?: string;
  iframes?: EsxIframe[];
}

type EsxResponse = Record<string, EsxMatch[]>;

async function fetchAll(): Promise<EsxResponse> {
  try {
    const res = await fetch(URL, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function findMatch(data: EsxResponse, game: StreamLookup): EsxMatch | undefined {
  const arr = data[LEAGUE_SPORT[game.league]];
  if (!Array.isArray(arr)) return undefined;
  return arr.find((m) => gameInText(m.tag ?? "", game));
}

function countGames(data: EsxResponse, games: readonly StreamLookup[]): StreamCountMap {
  return new Map(games.map((game) => [game.id, findMatch(data, game)?.iframes?.length ?? 0]));
}

function quality(server?: string): Stream["quality"] {
  const s = (server ?? "").toUpperCase();
  if (s.includes("4K")) return "4K";
  if (s.startsWith("SD")) return "SD";
  return "HD";
}

export const embedsportex: Provider = {
  name: "embedsportex",

  async getStreams(game) {
    const match = findMatch(await fetchAll(), game);
    if (!match?.iframes) return [];

    const out: Stream[] = [];
    for (const f of match.iframes) {
      if (!f.url) continue;
      out.push({ label: "", url: f.url, quality: quality(f.server), language: "EN" });
    }
    return out;
  },

  async getCounts(games) {
    return countGames(await fetchAll(), games);
  },
};
