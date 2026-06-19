import type { Game, League, Team } from "./types";
import { LEAGUE_BY_ID, type StreamCategory } from "./registry";
import { makeGameId } from "./game-id";
import type { PpvEvent } from "./streams/ppv";
import { fetchPpvListing, hasPpvListingStream, ppvCategoryKey } from "./streams/ppv";
import { FAST_CHANNELS, type FastChannel } from "./streams/fast";
import type { StreamProviderOptions } from "./streams/types";

const PT_TZ = "America/Los_Angeles";
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

const PPV_247_SPORT_CHANNELS: Record<string, League> = {
  "rally tv": "motorsports",
};

function todayInPT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ }).format(new Date());
}

function normalizeDate(dateStr?: string): string | null {
  if (!dateStr) return todayInPT();
  if (/^\d{8}$/.test(dateStr)) return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return null;
}

function dateInPT(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ }).format(new Date(ms));
}

function formatTimePT(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms)) + " PT";
}

function abbreviationFor(name: string): string {
  const words = name
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "EVT";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 4).map((word) => word[0]).join("").toUpperCase();
}

function teamFromName(name: string): Team {
  return {
    name,
    abbreviation: abbreviationFor(name),
    logo: "",
  };
}

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
  if (key === "24-7-streams") {
    return PPV_247_SPORT_CHANNELS[(event.name ?? "").trim().toLowerCase()] ?? null;
  }
  if (key === "fight" && !/^wrestling$/i.test(rawCategory)) return null;
  return PPV_CATEGORY_LEAGUES[key as StreamCategory] ?? null;
}

function ppvStartMs(event: PpvEvent, targetDate: string): number | null {
  if (event.always_live) return Date.now();
  if (typeof event.starts_at !== "number" || !Number.isFinite(event.starts_at)) return null;
  return event.starts_at * 1000;
}

function ppvEndMs(event: PpvEvent, startMs: number): number {
  if (event.always_live) return startMs + ALWAYS_LIVE_EVENT_LENGTH_MS;
  if (typeof event.ends_at === "number" && Number.isFinite(event.ends_at)) return event.ends_at * 1000;
  return startMs + DEFAULT_EVENT_LENGTH_MS;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
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
    espnId: `ppv:${sourceId}`,
    eventName: name,
    shortName: event.tag,
    homeTeam: teams.homeTeam,
    awayTeam: teams.awayTeam,
    startTime: new Date(startMs).toISOString(),
    status: status.status,
    statusDisplay: status.statusDisplay,
  };
}

function fastGame(channel: FastChannel): Game {
  const startMs = Date.now();
  const league = channel.league;

  return {
    id: makeGameId(league, `fast:${channel.slug}`),
    league,
    espnId: `fast:${channel.slug}`,
    eventName: channel.name,
    shortName: channel.aliases?.[0] ?? channel.name,
    homeTeam: teamFromName(channel.name),
    awayTeam: teamFromName(LEAGUE_BY_ID[league].short),
    startTime: new Date(startMs).toISOString(),
    status: "in",
    statusDisplay: "Live",
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
      const startMs = ppvStartMs(event, targetDate);
      if (!startMs) continue;
      const endMs = ppvEndMs(event, startMs);
      if (!ppvTouchesDate(event, startMs, endMs, targetDate)) continue;
      const game = ppvGame(event, league, startMs, endMs);
      if (game) games.push(game);
    }
  }

  return games;
}

async function getFastSourceGames(): Promise<Game[]> {
  return FAST_CHANNELS.map(fastGame);
}

function sourceGameKey(game: Game): string {
  const name = game.eventName ?? game.homeTeam.name;
  return `${game.league}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

export async function getSourceGames(dateStr?: string, options?: StreamProviderOptions): Promise<Game[]> {
  const targetDate = normalizeDate(dateStr);
  if (!targetDate) return [];

  const groups = await Promise.all([getPpvSourceGames(targetDate, options), getFastSourceGames()]);
  const games: Game[] = [];
  const seen = new Set<string>();
  const seenSourceNames = new Set<string>();

  for (const group of groups) {
    for (const game of group) {
      if (!game || seen.has(game.id)) continue;
      const key = sourceGameKey(game);
      if (seenSourceNames.has(key)) continue;
      seen.add(game.id);
      seenSourceNames.add(key);
      games.push(game);
    }
  }

  return games;
}
