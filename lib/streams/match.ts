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

// True if `text` (an event id, title, or "A vs B" tag) names this team — either as a
// contiguous slug ("boston-red-sox") or by containing every significant word (len > 2).
// The slug path handles dashed event ids; the word path handles space-separated titles.
function teamInText(text: string, teamName: string, abbreviation?: string): boolean {
  const haystack = text.toLowerCase();
  if (haystack.includes(slug(teamName))) return true;
  if (abbreviation && abbreviation.length > 1) {
    const escaped = abbreviation.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack)) return true;
  }

  const teamWords = words(teamName);
  return teamWords.length > 0 && teamWords.every((w) => haystack.includes(w));
}

function titleInText(text: string, title: string | undefined): boolean {
  const eventWords = words(title ?? "");
  if (eventWords.length === 0) return false;
  const uniqueWords = [...new Set(eventWords)];
  const haystack = text.toLowerCase();
  return uniqueWords.every((word) => haystack.includes(word));
}

function eventInText(text: string, game: StreamLookup): boolean {
  return titleInText(text, game.eventName) || titleInText(text, game.shortName);
}

// True if both of the game's teams are named somewhere in `text`.
export function gameInText(text: string, game: StreamLookup): boolean {
  return (
    teamInText(text, game.homeTeam.name, game.homeTeam.abbreviation)
    && teamInText(text, game.awayTeam.name, game.awayTeam.abbreviation)
  ) || eventInText(text, game);
}

export function categoryFor(game: StreamLookup): string {
  return streamCategoryFor(game.league);
}
