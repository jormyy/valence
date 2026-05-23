import type { Game, Stream } from "./types";

const STREAMED_BASE = "https://streamed.pk/api";

const CATEGORY: Record<string, string> = {
  nba:   "basketball",
  ncaab: "basketball",
  mlb:   "baseball",
  atp:   "tennis",
  wta:   "tennis",
};

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

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function matchesGame(event: StreamedEvent, game: Game): boolean {
  const id = event.id.toLowerCase();
  return id.includes(slug(game.awayTeam.name)) && id.includes(slug(game.homeTeam.name));
}

async function fetchTodayEvents(): Promise<StreamedEvent[]> {
  const res = await fetch(`${STREAMED_BASE}/matches/all-today`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchSourceStreams(source: string, id: string): Promise<StreamedStream[]> {
  const res = await fetch(`${STREAMED_BASE}/stream/${source}/${id}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function findMatch(events: StreamedEvent[], game: Game): StreamedEvent | undefined {
  const category = CATEGORY[game.league];
  return events.find((e) => e.category === category && matchesGame(e, game));
}

export async function getStreams(game: Game): Promise<Stream[]> {
  const events = await fetchTodayEvents();
  const match = findMatch(events, game);
  if (!match) return [];

  const results = await Promise.all(
    match.sources.map((s) => fetchSourceStreams(s.source, s.id))
  );

  const streams: Stream[] = [];
  const seen = new Set<string>();
  for (const group of results) {
    for (const s of group) {
      if (!s.hd || !s.embedUrl || seen.has(s.embedUrl)) continue;
      streams.push({
        label: `HD ${streams.length + 1}`,
        url: s.embedUrl,
        quality: "HD",
        language: s.language || "EN",
      });
      seen.add(s.embedUrl);
    }
  }
  return streams;
}

// Lightweight count for the home page — only checks the events list, no per-stream fetches.
// Next.js deduplicates the fetchTodayEvents fetch across all games in the same render.
export async function getStreamCount(game: Game): Promise<number> {
  const events = await fetchTodayEvents();
  const match = findMatch(events, game);
  return match?.sources.length ?? 0;
}
