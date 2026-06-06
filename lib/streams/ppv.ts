import type { Game, Stream } from "../types";
import type { Provider } from "./types";
import { LEAGUE_SPORT, gameInText } from "./match";

// ppv.land's public backend. The ppv.land front-end is mid-relaunch ("Coming Soon"),
// but api.ppv.to is live: a listing groups events under named categories, and each
// event's iframe comes from a per-id detail call (sources[].type === "iframe").
// Its category names match the shared sport buckets (basketball/baseball/tennis).
const BASE = "https://api.ppv.to/api";

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
  const want = LEAGUE_SPORT[game.league];
  for (const cat of listing) {
    if ((cat.category ?? "").toLowerCase() !== want) continue;
    for (const ev of cat.streams ?? []) {
      if (gameInText(ev.name ?? "", game)) return ev;
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
