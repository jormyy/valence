import type { Team } from "./types";

// Derives a short uppercase tag from a free-text name (event/team) when the source
// doesn't provide one — e.g. "Real Madrid CF" → "RMC", "Lakers" → "LAKE".
export function abbreviationFor(name: string): string {
  const words = name
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "EVT";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 4).map((word) => word[0]).join("").toUpperCase();
}

export function teamFromName(name: string): Team {
  return {
    name,
    abbreviation: abbreviationFor(name),
  };
}
