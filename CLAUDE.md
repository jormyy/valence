# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # start dev server at localhost:3000
npm run build  # production build
npm run start  # serve production build
```

## Architecture

**Valence** is a sports stream aggregator for NBA and NCAAB. It shows live and upcoming games and lets users watch embedded streams.

### Data flow

- **Game/schedule data** — fetched at request time from ESPN's public scoreboard API (`lib/espn.ts`). No API key required. Revalidates every 60s.
  - NBA: `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
  - NCAAB: `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`

- **Stream links** — stored in `data/streams.json`, keyed by `"{league}-{espn_event_id}"` (e.g. `"nba-401585528"`). To add streams for a game, find its ESPN event ID from the API response and add an entry. `lib/streams.ts` reads this file at build/request time.

### Key files

- `lib/espn.ts` — fetches and normalizes game data from ESPN
- `lib/streams.ts` — reads stream links from the JSON file
- `lib/types.ts` — shared types (`Game`, `Stream`, `League`, etc.)
- `data/streams.json` — the only "database"; edit this to add stream links
- `components/GameCard.tsx` — game listing card on the home page
- `components/StreamList.tsx` — client component with iframe player + stream selector tabs
- `app/event/[id]/page.tsx` — event page; `id` param is `"{league}-{espnId}"`

### Adding streams for a game

1. Find the ESPN event ID from the API or the game URL on ESPN
2. Add to `data/streams.json`:
   ```json
   "nba-401585528": [
     { "label": "Stream 1", "url": "https://...", "quality": "HD", "language": "EN" }
   ]
   ```
3. Redeploy (or the next revalidation will pick it up in dev)
