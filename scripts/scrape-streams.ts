/**
 * Scrapes stream iframes for today's NBA, NCAAB, and MLB games.
 * Merges results into data/streams.json without overwriting existing entries.
 *
 * Usage:
 *   npx tsx scripts/scrape-streams.ts
 *
 * Sources are defined in SOURCES below. Add/remove as needed.
 */

import { chromium } from "playwright";
import type { Page } from "playwright";
import fs from "fs";
import path from "path";
import { getAllGames } from "../lib/espn";
import type { Game } from "../lib/types";

// ---------------------------------------------------------------------------
// Source definitions
// ---------------------------------------------------------------------------

/**
 * "direct" — construct the game URL directly from team/league slugs.
 * "index"  — visit a league index page, find the link matching the game, follow it.
 */
type SourceStrategy =
  | { type: "direct"; url: (game: Game) => string }
  | { type: "index"; indexUrl: (game: Game) => string; linkText: (game: Game) => string[] };

interface Source {
  name: string;
  strategy: SourceStrategy;
  iframeSelector: string;
  quality: "HD" | "SD";
}

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// City/nickname only (e.g. "Los Angeles Lakers" → "lakers")
function shortSlug(name: string) {
  const parts = name.split(" ");
  return parts[parts.length - 1].toLowerCase();
}

const SOURCES: Source[] = [
  // ------------------------------------------------------------------
  // istreameast.is  — URLs are /links/{away}-vs-{home}-{internal-id}
  //                   so we scan the sport index page for a matching link
  // ------------------------------------------------------------------
  {
    name: "iStreamEast",
    strategy: {
      type: "index",
      indexUrl: (game) => `https://istreameast.is/${game.league}`,
      linkText: (game) => [slug(game.awayTeam.name), slug(game.homeTeam.name)],
    },
    iframeSelector: "iframe",
    quality: "HD",
  },
  // ------------------------------------------------------------------
  // methstreams.ms  — index page per league, find matching game link
  // ------------------------------------------------------------------
  {
    name: "MethStreams",
    strategy: {
      type: "index",
      indexUrl: (game) => `https://methstreams.ms/league/${game.league}streams`,
      // match links containing either team's short name
      linkText: (game) => [
        shortSlug(game.awayTeam.name),
        shortSlug(game.homeTeam.name),
        game.awayTeam.abbreviation.toLowerCase(),
        game.homeTeam.abbreviation.toLowerCase(),
      ],
    },
    iframeSelector: "iframe",
    quality: "HD",
  },
  // ------------------------------------------------------------------
  // streameastv1.com — direct URL, full team name slugs
  // ------------------------------------------------------------------
  {
    name: "StreamEastV1",
    strategy: {
      type: "direct",
      url: (game) =>
        `https://streameastv1.com/${game.league}/${slug(game.awayTeam.name)}-vs-${slug(game.homeTeam.name)}`,
    },
    iframeSelector: "iframe",
    quality: "SD",
  },
];

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

async function scrapeIframes(page: Page, url: string, selector: string): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    const frames = await page.$$eval(selector, (iframes) =>
      iframes
        .map((el) => (el as HTMLIFrameElement).src)
        .filter((src) => src?.startsWith("http"))
    );
    return [...new Set(frames)];
  } catch {
    return [];
  }
}

/** For "index" sources: visit league page, find the game link, return its href. */
async function findGameLink(page: Page, indexUrl: string, keywords: string[]): Promise<string | null> {
  try {
    await page.goto(indexUrl, { waitUntil: "networkidle", timeout: 15000 });
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.toLowerCase() ?? "" }))
    );
    const match = links.find(({ href, text }) =>
      keywords.every((kw) => href.includes(kw) || text.includes(kw)) ||
      keywords.filter((kw) => href.includes(kw) || text.includes(kw)).length >= 2
    );
    return match?.href ?? null;
  } catch {
    return null;
  }
}

async function getStreamsForSource(page: Page, source: Source, game: Game): Promise<string[]> {
  if (source.strategy.type === "direct") {
    const url = source.strategy.url(game);
    console.log(`  [${source.name}] ${url}`);
    return scrapeIframes(page, url, source.iframeSelector);
  }

  // index strategy
  const indexUrl = source.strategy.indexUrl(game);
  const keywords = source.strategy.linkText(game);
  console.log(`  [${source.name}] scanning ${indexUrl}`);
  const gameUrl = await findGameLink(page, indexUrl, keywords);

  if (!gameUrl) {
    console.log(`  [${source.name}] → no matching link found`);
    return [];
  }

  console.log(`  [${source.name}] → found ${gameUrl}`);
  return scrapeIframes(page, gameUrl, source.iframeSelector);
}

async function main() {
  const games = await getAllGames();
  console.log(`Found ${games.length} games today\n`);

  const updated = loadStreams();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  // Block ad networks, trackers, and popunder scripts
  await context.route(/\.(doubleclick|googlesyndication|adservice|google-analytics|googletagmanager|outbrain|taboola|popads|popcash|propellerads|exoclick|trafficjunky|juicyads|adsterra|yllix|hilltopads|revcontent|mgid)\.|popunder|pop-under|popwindow|redirect\.php|clickurl|adclick/, (route) => route.abort());

  const page = await context.newPage();

  // Close any popup windows that open
  context.on("page", (popup) => { popup.close().catch(() => {}); });

  const now = Date.now();
  const scrapeable = games.filter((g) => {
    if (g.status === "post") return false; // already finished
    if (g.status === "in") return true;    // live — always scrape
    const minsUntilStart = (new Date(g.startTime).getTime() - now) / 60000;
    return minsUntilStart <= 30;           // starting within 30 min
  });

  console.log(`Scraping ${scrapeable.length} of ${games.length} games (live or starting within 30 min)\n`);

  for (const game of scrapeable) {
    console.log(`\n${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} (${game.league.toUpperCase()}) [${game.status}]`);

    for (const source of SOURCES) {
      const iframes = await getStreamsForSource(page, source, game);

      if (iframes.length === 0) {
        console.log(`  [${source.name}] → no iframes`);
        continue;
      }

      console.log(`  [${source.name}] → ${iframes.length} iframe(s)`);

      const existing = updated[game.id] ?? [];
      const seen = new Set(existing.map((s) => s.url));

      for (const url of iframes) {
        if (seen.has(url)) continue;
        existing.push({ label: `${source.name} ${existing.length + 1}`, url, quality: source.quality, language: "EN" });
        seen.add(url);
      }

      updated[game.id] = existing;
    }
  }

  await browser.close();
  saveStreams(updated);

  const total = Object.values(updated).flat().length;
  console.log(`\nDone. ${total} total streams in data/streams.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
