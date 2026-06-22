import type { Game, League } from "./types";
import { LEAGUE_BY_ID, type StreamCategory } from "./registry";
import { makeGameId } from "./game-id";
import type { PpvEvent } from "./streams/ppv";
import { fetchPpvListing, hasPpvListingStream, ppvCategoryKey } from "./streams/ppv";
import type { StreamProviderOptions } from "./streams/types";
import { dateInPT, formatTimePT, normalizeDate, dayNumber } from "./datetime";
import { teamFromName } from "./team";

const DEFAULT_EVENT_LENGTH_MS = 3 * 60 * 60 * 1000;
const ALWAYS_LIVE_EVENT_LENGTH_MS = 24 * 60 * 60 * 1000;

const PPV_CATEGORY_LEAGUES: Partial<Record<StreamCategory, League>> = {
  "american-football": "gridiron",
  football: "world-football",
  rugby: "rugby",
  volleyball: "volleyball",
  cricket: "cricket",
  fight: "wrestling",
};

function splitMatchup(name: string): readonly [string, string] | null {
  const parts = name
    .split(/\s+(?:vs\.?|v\.?|at)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return [parts[0], parts.slice(1).join(" ")];
}

function ppvLeague(event: PpvEvent, categoryName: string): League | null {
  const rawCategory = event.category_name ?? categoryName;
  const key = ppvCategoryKey(rawCategory);
  if (key === "24-7-streams") return null;
  if (key === "fight" && !/^wrestling$/i.test(rawCategory)) return null;
  return PPV_CATEGORY_LEAGUES[key as StreamCategory] ?? null;
}

function ppvStartMs(event: PpvEvent): number | null {
  if (event.always_live) return Date.now();
  if (typeof event.starts_at !== "number" || !Number.isFinite(event.starts_at)) return null;
  return event.starts_at * 1000;
}

function ppvEndMs(event: PpvEvent, startMs: number): number {
  if (event.always_live) return startMs + ALWAYS_LIVE_EVENT_LENGTH_MS;
  if (typeof event.ends_at === "number" && Number.isFinite(event.ends_at)) return event.ends_at * 1000;
  return startMs + DEFAULT_EVENT_LENGTH_MS;
}

function eventTouchesDate(startMs: number, endMs: number, targetDate: string): boolean {
  const target = dayNumber(targetDate);
  return dayNumber(dateInPT(startMs)) <= target && dayNumber(dateInPT(endMs)) >= target;
}

function ppvTouchesDate(event: PpvEvent, startMs: number, endMs: number, targetDate: string): boolean {
  return Boolean(event.always_live) || eventTouchesDate(startMs, endMs, targetDate);
}

function sourceStatus(event: { readonly always_live?: number }, startMs: number, endMs: number): Pick<Game, "status" | "statusDisplay"> {
  const now = Date.now();
  if (event.always_live || (now >= startMs && now <= endMs)) {
    return { status: "in", statusDisplay: "Live" };
  }
  if (now < startMs) {
    return { status: "pre", statusDisplay: formatTimePT(startMs) };
  }
  return { status: "post", statusDisplay: "Final" };
}

function ppvGame(event: PpvEvent, league: League, startMs: number, endMs: number): Game | null {
  const name = event.name?.trim();
  if (!name) return null;

  const matchup = splitMatchup(name);
  const teams = matchup
    ? { awayTeam: teamFromName(matchup[0]), homeTeam: teamFromName(matchup[1]) }
    : {
        awayTeam: teamFromName(LEAGUE_BY_ID[league].short),
        homeTeam: teamFromName(name),
      };
  const sourceId = event.uri_name || String(event.id);
  const status = sourceStatus(event, startMs, endMs);

  return {
    id: makeGameId(league, `ppv:${sourceId.replace(/~/g, "-")}`),
    league,
    eventName: name,
    shortName: event.tag,
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    startTime: new Date(startMs).toISOString(),
    status: status.status,
    statusDisplay: status.statusDisplay,
  };
}

async function getPpvSourceGames(targetDate: string, options?: StreamProviderOptions): Promise<Game[]> {
  const listing = await fetchPpvListing(options);
  const games: Game[] = [];

  for (const category of listing) {
    const categoryName = category.category ?? "";
    for (const event of category.streams ?? []) {
      const league = ppvLeague(event, categoryName);
      if (!league) continue;
      if (!hasPpvListingStream(event)) continue;
      const startMs = ppvStartMs(event);
      if (!startMs) continue;
      const endMs = ppvEndMs(event, startMs);
      if (!ppvTouchesDate(event, startMs, endMs, targetDate)) continue;
      const game = ppvGame(event, league, startMs, endMs);
      if (game) games.push(game);
    }
  }

  return games;
}

function sourceGameKey(game: Game): string {
  const name = game.eventName ?? game.homeTeam.name;
  return `${game.league}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

export async function getSourceGames(dateStr?: string, options?: StreamProviderOptions): Promise<Game[]> {
  const targetDate = normalizeDate(dateStr);
  if (!targetDate) return [];

  // Dedup events that show up under multiple PPV categories (same matchup name).
  const games: Game[] = [];
  const seenNames = new Set<string>();
  for (const game of await getPpvSourceGames(targetDate, options)) {
    const key = sourceGameKey(game);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    games.push(game);
  }

  return games;
}
