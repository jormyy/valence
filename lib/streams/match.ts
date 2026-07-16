import { streamCategoryFor } from "../registry";
import type { StreamLookup } from "./types";

// Converts each non-alphanumeric char to a dash, matching streamed.pk's slug convention.
// "St. Louis Cardinals" → "st--louis-cardinals" (period AND space each become "-")
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "live",
  "stream",
  "streams",
  "game",
  "match",
]);

function words(value: string): string[] {
  return value.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Builds a test for one team, precomputing its slug, significant words, and an
// optional abbreviation word-boundary regex. `haystack` must already be lowercased.
function teamTest(name: string, abbreviation?: string): (haystack: string) => boolean {
  const teamSlug = slug(name);
  const teamWords = words(name);
  const abbr = abbreviation && abbreviation.length > 1 ? abbreviation.toLowerCase() : "";
  const abbrRegex = abbr ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(abbr)}([^a-z0-9]|$)`) : null;

  return (haystack: string): boolean => {
    if (haystack.includes(teamSlug)) return true;
    if (abbrRegex && abbrRegex.test(haystack)) return true;
    return teamWords.length > 0 && teamWords.every((w) => haystack.includes(w));
  };
}

export interface GameMatcher {
  // True if `text` (an event id, title, or "A vs B" tag) names this game — either
  // by naming both teams or by containing every significant word of the event title.
  test(text: string): boolean;
}

// Memoized per game object. The same game flows through all four providers' getCounts
// in a single request, so its matcher (which compiles slugs/words/regexes) is built
// once instead of four times. Keyed on object identity, so it's request-scoped and GCs
// with the game.
const matcherCache = new WeakMap<StreamLookup, GameMatcher>();

// Precompute a game's match shape ONCE, then test it against every event in a
// provider listing. Avoids rebuilding slugs/words/regexes per (game, event) pair —
// the dominant cost when matching hundreds of games against hundreds of events.
export function buildGameMatcher(game: StreamLookup): GameMatcher {
  const cached = matcherCache.get(game);
  if (cached) return cached;
  const matcher = createMatcher(game);
  matcherCache.set(game, matcher);
  return matcher;
}

function createMatcher(game: StreamLookup): GameMatcher {
  const homeTest = teamTest(game.homeTeam.name, game.homeTeam.abbreviation);
  const awayTest = teamTest(game.awayTeam.name, game.awayTeam.abbreviation);
  const titleWordSets = [game.eventName, game.shortName]
    .map((title) => [...new Set(words(title ?? ""))])
    .filter((set) => set.length > 0);

  return {
    test(text: string): boolean {
      const haystack = text.toLowerCase();
      if (homeTest(haystack) && awayTest(haystack)) return true;
      return titleWordSets.some((set) => set.every((word) => haystack.includes(word)));
    },
  };
}

export function categoryFor(game: StreamLookup): string {
  return streamCategoryFor(game.league);
}
