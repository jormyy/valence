export type League = "nba" | "ncaab" | "mlb" | "atp" | "wta";

export interface Team {
  name: string;
  abbreviation: string;
  logo: string;
  score?: string;
}

export interface Game {
  id: string; // "{league}-{espn_id}"
  league: League;
  espnId: string;
  homeTeam: Team;
  awayTeam: Team;
  startTime: string; // ISO string
  status: "pre" | "in" | "post";
  statusDisplay: string; // "7:30 PM ET", "Q3 4:22", "Final"
  period?: string;
  clock?: string;
}

export interface Stream {
  label: string;
  url: string;
  quality: "HD" | "SD" | "4K";
  language?: string;
}
