import { streamCategoryFor } from "../registry";
import type { StreamLookup } from "./types";

// Converts each non-alphanumeric char to a dash, matching streamed.pk's slug convention.
// "St. Louis Cardinals" → "st--louis-cardinals" (period AND space each become "-")
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

// True if `text` (an event id, title, or "A vs B" tag) names this team — either as a
// contiguous slug ("boston-red-sox") or by containing every significant word (len > 2).
// The slug path handles dashed event ids; the word path handles space-separated titles.
function teamInText(text: string, teamName: string): boolean {
  const haystack = text.toLowerCase();
  if (haystack.includes(slug(teamName))) return true;

  const words = teamName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => haystack.includes(w));
}

// True if both of the game's teams are named somewhere in `text`.
export function gameInText(text: string, game: StreamLookup): boolean {
  return teamInText(text, game.homeTeam.name) && teamInText(text, game.awayTeam.name);
}

export function categoryFor(game: StreamLookup): string {
  return streamCategoryFor(game.league);
}
