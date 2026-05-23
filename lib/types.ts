export type League = "nba" | "ncaab" | "mlb" | "atp" | "wta";

export interface Team {
  name: string;
  abbreviation: string;
  logo: string;
  score?: string;
}

export interface Game {
  id: string;
  league: League;
  espnId: string;
  homeTeam: Team;
  awayTeam: Team;
  startTime: string;
  status: "pre" | "in" | "post";
  statusDisplay: string;
  period?: string;
  clock?: string;
}

export interface GameWithStreams extends Game {
  streamCount?: number;
}

export interface Stream {
  label: string;
  url: string;
  quality: "HD" | "SD" | "4K";
  language?: string;
}

export interface StatLeader {
  athlete: string;
  value: string;
  category: string;
}

export interface TeamStats {
  teamName: string;
  leaders: StatLeader[];
}

// ESPN scoreboard response shapes (minimal, only what we read)

export interface EspnAthlete {
  displayName?: string;
  headshot?: { href?: string };
}

export interface EspnTeam {
  displayName: string;
  abbreviation: string;
  logo: string;
}

export interface EspnCompetitor {
  homeAway?: "home" | "away";
  score?: string;
  team?: EspnTeam;
  athlete?: EspnAthlete;
}

export interface EspnStatus {
  type: { state: string; shortDetail: string };
  period?: number;
  displayClock?: string;
}

export interface EspnCompetition {
  id: string;
  date: string;
  status: EspnStatus;
  competitors: EspnCompetitor[];
}

export interface EspnEvent {
  id: string;
  date: string;
  status: EspnStatus;
  competitions: EspnCompetition[];
}

export interface EspnTennisGrouping {
  competitions?: EspnCompetition[];
}

export interface EspnTennisTournament {
  groupings?: EspnTennisGrouping[];
}

export interface EspnScoreboard {
  events?: EspnEvent[];
}

export interface EspnTennisScoreboard {
  events?: EspnTennisTournament[];
}

export interface EspnLeader {
  athlete?: { displayName?: string };
  displayValue?: string;
}

export interface EspnLeaderCategory {
  displayName?: string;
  leaders?: EspnLeader[];
}

export interface EspnTeamLeaders {
  team?: { displayName?: string };
  leaders?: EspnLeaderCategory[];
}

export interface EspnSummary {
  leaders?: EspnTeamLeaders[];
}
