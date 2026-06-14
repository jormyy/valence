import type { Game, Stream } from "../types";
import type { Provider } from "./types";
import { gameInText } from "./match";

// YouTube as a CLEAN source. Some of these games are carried free on YouTube (MLB's free games,
// college/international, the occasional NBA/WNBA), and YouTube's embed has no Adcash pop-under — a
// plain click plays it with ZERO pop-ups. So unlike the streamed.pk family (which fuses play+pop on
// one pointerdown), a YouTube stream needs no guard and no keyboard trick: the Player renders it as
// a bare iframe and a normal tap Just Works. That's the click-to-play-zero-pop path, populated.
//
// Needs a YouTube Data API key (env YOUTUBE_API_KEY); without one this provider is inert (returns
// nothing), so it never breaks the app. Results are filtered to titles/channels that name BOTH of
// the game's teams, so we never surface an unrelated video, and flagged `clean` so the Player drops
// the ad-guard for them.
const KEY = process.env.YOUTUBE_API_KEY;
const SEARCH = "https://www.googleapis.com/youtube/v3/search";

interface YtItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
}
interface YtResponse { items?: YtItem[] }

async function search(game: Game): Promise<YtItem[]> {
  if (!KEY) return [];
  const q = `${game.awayTeam.name} ${game.homeTeam.name}`;
  const url =
    `${SEARCH}?part=snippet&type=video&eventType=live&maxResults=6` +
    `&q=${encodeURIComponent(q)}&key=${KEY}`;
  try {
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const json: YtResponse = await res.json();
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

// Keep only results whose title+channel names both teams — guards against highlight clips,
// previews, and unrelated videos the search may return.
function isThisGame(item: YtItem, game: Game): boolean {
  if (!item.id?.videoId) return false;
  const text = `${item.snippet?.title ?? ""} ${item.snippet?.channelTitle ?? ""}`;
  return gameInText(text, game);
}

export const youtube: Provider = {
  name: "youtube",

  async getStreams(game) {
    const items = (await search(game)).filter((i) => isThisGame(i, game));
    const out: Stream[] = [];
    const seen = new Set<string>();
    for (const i of items) {
      const id = i.id!.videoId!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        label: "",
        url: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        quality: "HD",
        language: "EN",
        clean: true,
      });
    }
    return out;
  },

  // getCount must stay cheap (it runs for every game on the home page). A YouTube search per game
  // would blow the quota, so we don't count here — YouTube streams surface on demand in the watch
  // panel via getStreams. The feed badge just under-counts by the (usually zero) YouTube matches.
  async getCount() {
    return 0;
  },
};
