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

// Converts each non-alphanumeric char to a dash, matching streamed.pk's slug convention.
// "St. Louis Cardinals" → "st--louis-cardinals" (period AND space each become "-")
function slug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, "-");
}

function matchesTeam(eventId: string, teamName: string): boolean {
  const teamSlug = slug(teamName);
  if (eventId.includes(teamSlug)) return true;

  // Fallback: check all significant words (len > 2) individually
  const words = teamName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => eventId.includes(w));
}

function matchesGame(event: StreamedEvent, game: Game): boolean {
  const id = event.id.toLowerCase();
  return matchesTeam(id, game.awayTeam.name) && matchesTeam(id, game.homeTeam.name);
}

async function fetchTodayEvents(): Promise<StreamedEvent[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${STREAMED_BASE}/matches/all-today`, {
        next: { revalidate: 60 },
      });
      if (res.ok) return res.json();
    } catch {
      // network error — retry on first attempt, fall through on second
    }
  }
  console.error("[streams] fetchTodayEvents failed after retries");
  return [];
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

  // Dedup sources before fetching to avoid redundant requests
  const seen = new Set<string>();
  const uniqueSources = match.sources.filter(({ source, id }) => {
    const key = `${source}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = await Promise.all(
    uniqueSources.map((s) => fetchSourceStreams(s.source, s.id))
  );

  const streams: Stream[] = [];
  const seenUrls = new Set<string>();
  for (const group of results) {
    for (const s of group) {
      if (!s.hd || !s.embedUrl || seenUrls.has(s.embedUrl)) continue;
      streams.push({
        label: `HD ${streams.length + 1}`,
        url: s.embedUrl,
        quality: "HD",
        language: s.language || "EN",
      });
      seenUrls.add(s.embedUrl);
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
