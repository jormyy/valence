/**
 * Scrapes HD stream embeds for today's NBA, NCAAB, and MLB games
 * using the streamed.pk API — no browser required.
 *
 * Usage:
 *   npx tsx scripts/scrape-streams.ts
 */

import fs from "fs";
import path from "path";
import { getAllGames } from "../lib/espn";
import type { Game } from "../lib/types";

// ---------------------------------------------------------------------------
// streamed.pk API types
// ---------------------------------------------------------------------------

interface StreamedEvent {
  id: string;         // e.g. "milwaukee-brewers-vs-cincinnati-reds-2444938"
  title: string;
  category: string;   // "basketball" | "baseball" | ...
  date: number;       // unix ms
  sources: { source: string; id: string }[];
}

interface StreamedStream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
}

const STREAMED_BASE = "https://streamed.pk/api";

// ESPN league → streamed.pk category
const CATEGORY: Record<string, string> = {
  nba:   "basketball",
  ncaab: "basketball",
  mlb:   "baseball",
  atp:   "tennis",
  wta:   "tennis",
};

// ---------------------------------------------------------------------------

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function matchesGame(event: StreamedEvent, game: Game): boolean {
  const id = event.id.toLowerCase();
  return id.includes(slug(game.awayTeam.name)) && id.includes(slug(game.homeTeam.name));
}

async function fetchTodayEvents(): Promise<StreamedEvent[]> {
  const res = await fetch(`${STREAMED_BASE}/matches/all-today`);
  if (!res.ok) throw new Error(`streamed.pk /matches/all-today returned ${res.status}`);
  return res.json();
}

async function fetchStreams(source: string, id: string): Promise<StreamedStream[]> {
  const res = await fetch(`${STREAMED_BASE}/stream/${source}/${id}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// ---------------------------------------------------------------------------

const STREAMS_PATH = path.join(process.cwd(), "data/streams.json");
const PT = "America/Los_Angeles";

function todayPT() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
}

function loadStreams(): Record<string, { label: string; url: string; quality: string; language?: string }[]> {
  const raw = fs.readFileSync(STREAMS_PATH, "utf-8");
  const { _comment: _, _date, ...entries } = JSON.parse(raw);
  if (_date !== todayPT()) {
    console.log(`New day (was ${_date ?? "unset"}, now ${todayPT()}) — clearing stale streams\n`);
    return {};
  }
  return entries;
}

function saveStreams(data: Record<string, unknown>) {
  const out = {
    _comment: "Keys are '{league}-{espn_event_id}'. Auto-populated by scrape-streams.ts.",
    _date: todayPT(),
    ...data,
  };
  fs.writeFileSync(STREAMS_PATH, JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------------------

async function main() {
  const [espnGames, streamedEvents] = await Promise.all([
    getAllGames(),
    fetchTodayEvents(),
  ]);

  const now = Date.now();
  const scrapeable = espnGames.filter((g) => {
    if (g.status === "post") return false;
    if (g.status === "in") return true;
    return (new Date(g.startTime).getTime() - now) / 60000 <= 30;
  });

  console.log(`ESPN: ${espnGames.length} games today, scraping ${scrapeable.length} (live or starting within 30 min)`);
  console.log(`streamed.pk: ${streamedEvents.length} events today\n`);

  const updated = loadStreams();

  for (const game of scrapeable) {
    const targetCategory = CATEGORY[game.league];
    const match = streamedEvents.find(
      (e) => e.category === targetCategory && matchesGame(e, game)
    );

    console.log(`${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} (${game.league.toUpperCase()})`);

    if (!match) {
      console.log(`  → no match on streamed.pk\n`);
      continue;
    }

    console.log(`  → matched: ${match.id} (${match.sources.length} sources)`);

    const existing = updated[game.id] ?? [];
    const seen = new Set(existing.map((s) => s.url));

    // Fetch all sources in parallel, filter to HD only
    const results = await Promise.all(
      match.sources.map((s) => fetchStreams(s.source, s.id))
    );

    let added = 0;
    for (const streams of results) {
      for (const stream of streams) {
        if (!stream.hd) continue;
        if (!stream.embedUrl || seen.has(stream.embedUrl)) continue;
        existing.push({
          label: `HD ${existing.length + 1}`,
          url: stream.embedUrl,
          quality: "HD",
          language: stream.language || "EN",
        });
        seen.add(stream.embedUrl);
        added++;
      }
    }

    console.log(`  → ${added} new HD stream(s) added\n`);
    updated[game.id] = existing;
  }

  saveStreams(updated);

  const total = Object.values(updated).flat().length;
  console.log(`Done. ${total} total streams in data/streams.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
