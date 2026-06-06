import type { Game, Stream } from "../types";
import type { Provider } from "./types";
import { LEAGUE_SPORT, gameInText } from "./match";

// streamed.pk — the original backend. A single "all-today" listing carries source
// references; each (source, id) pair is resolved to embed URLs via a per-source call.
//
// The streamed project rotates/loses domains, so we try its official mirrors in order
// (all serve byte-identical data). Add new mirrors here as the old ones go down.
const MIRRORS = ["https://streamed.pk/api", "https://streamed.st/api"];

interface StreamedEvent {
  id: string;
  category: string;
  sources: { source: string; id: string }[];
}

interface StreamedStream {
  hd: boolean;
  embedUrl: string;
  language: string;
}

// Fetches `path` from the first mirror that answers OK, so one dead domain falls over
// to the next. Returns null if every mirror fails.
async function fetchMirror(path: string): Promise<Response | null> {
  for (const base of MIRRORS) {
    try {
      const res = await fetch(`${base}${path}`, { next: { revalidate: 60 } });
      if (res.ok) return res;
    } catch {
      // try the next mirror
    }
  }
  return null;
}

async function fetchTodayEvents(): Promise<StreamedEvent[]> {
  const res = await fetchMirror("/matches/all-today");
  if (!res) {
    console.error("[streams:streamed] all mirrors failed");
    return [];
  }
  try {
    return await res.json();
  } catch {
    return [];
  }
}

function matchEvent(events: StreamedEvent[], game: Game): StreamedEvent | undefined {
  const category = LEAGUE_SPORT[game.league];
  return events.find((e) => e.category === category && gameInText(e.id, game));
}

async function fetchSourceStreams(source: string, id: string): Promise<StreamedStream[]> {
  const res = await fetchMirror(`/stream/${source}/${id}`);
  if (!res) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

export const streamed: Provider = {
  name: "streamed",

  async getStreams(game) {
    const event = matchEvent(await fetchTodayEvents(), game);
    if (!event) return [];

    // Dedup sources before fetching to avoid redundant requests.
    const seen = new Set<string>();
    const sources = event.sources.filter(({ source, id }) => {
      const key = `${source}:${id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const groups = await Promise.all(sources.map((s) => fetchSourceStreams(s.source, s.id)));
    const out: Stream[] = [];
    for (const group of groups) {
      for (const s of group) {
        if (!s.hd || !s.embedUrl) continue;
        out.push({ label: "", url: s.embedUrl, quality: "HD", language: s.language || "EN" });
      }
    }
    return out;
  },

  async getCount(game) {
    const event = matchEvent(await fetchTodayEvents(), game);
    return event?.sources.length ?? 0;
  },
};
