import type { Game, League, Stream } from "../types";
import type { Provider } from "./types";
import { teamInText } from "./match";

// ppv.land's public backend. The ppv.land front-end is mid-relaunch ("Coming Soon"),
// but api.ppv.to is live: a listing groups events under named categories, and each
// event's iframe comes from a per-id detail call (sources[].type === "iframe").
const BASE = "https://api.ppv.to/api";

// ppv category names (lowercased) that correspond to each Valence league's sport.
const PPV_CATEGORY: Record<League, string> = {
  nba:   "basketball",
  ncaab: "basketball",
  mlb:   "baseball",
  atp:   "tennis",
  wta:   "tennis",
};

interface PpvEvent {
  id: number;
  name?: string;
}

interface PpvCategory {
  category?: string;
  streams?: PpvEvent[];
}

interface PpvSource {
  type?: string;
  data?: string;
}

async function fetchListing(): Promise<PpvCategory[]> {
  try {
    const res = await fetch(`${BASE}/streams`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.streams) ? json.streams : [];
  } catch {
    return [];
  }
}

function findEvent(listing: PpvCategory[], game: Game): PpvEvent | undefined {
  const want = PPV_CATEGORY[game.league];
  for (const cat of listing) {
    if ((cat.category ?? "").toLowerCase() !== want) continue;
    for (const ev of cat.streams ?? []) {
      const text = ev.name ?? "";
      if (teamInText(text, game.homeTeam.name) && teamInText(text, game.awayTeam.name)) {
        return ev;
      }
    }
  }
  return undefined;
}

async function fetchSources(id: number): Promise<PpvSource[]> {
  try {
    const res = await fetch(`${BASE}/streams/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.sources) ? json.data.sources : [];
  } catch {
    return [];
  }
}

export const ppv: Provider = {
  name: "ppv",

  async getStreams(game) {
    const event = findEvent(await fetchListing(), game);
    if (!event) return [];

    const sources = await fetchSources(event.id);
    const out: Stream[] = [];
    for (const s of sources) {
      if (s.type !== "iframe" || !s.data) continue;
      out.push({ label: "", url: s.data, quality: "HD", language: "EN" });
    }
    return out;
  },

  async getCount(game) {
    return findEvent(await fetchListing(), game) ? 1 : 0;
  },
};
