# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # start dev server at localhost:3000
npm run build  # production build
npm run start  # serve production build
```

### Player origin

Provider documents must run on a dedicated origin so their retained-origin iframe
can use storage/native HLS without sharing the app's DOM or storage. Local development
uses `player.localhost` automatically. Production must provision a second hostname to
the same deployment and configure the pair explicitly:

```bash
VALENCE_APP_ORIGIN=https://valence.example
VALENCE_PLAYER_ORIGIN=https://player.valence.example
```

Both values are required and must be different origins. Playback fails closed with a
503 if either is missing or the request does not match `VALENCE_APP_ORIGIN`.

## Architecture

**Valence** is a sports stream aggregator for NBA, NCAAB, MLB, ATP, and WTA. It shows live and upcoming games and lets users watch embedded streams.

### Data flow

- **Game/schedule data** — fetched at request time from ESPN's public scoreboard API (`lib/espn.ts`). No API key required. Revalidates every 60s. 5 leagues in parallel:
  - NBA: `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
  - NCAAB: `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
  - MLB: `site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`
  - ATP: `site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard`
  - WTA: `site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard`

- **Stream links** — fetched live from the stream providers in `lib/streams/`. Team names are fuzzy-matched against provider event listings. No local storage of stream data.

- **Stats** — fetched per-game from ESPN's summary API on demand when viewing the Stats tab.

### API routes

- `GET /api/games?date=YYYYMMDD` — returns all games with stream counts
- `POST /api/streams` — returns streams for a selected game lookup payload
- `GET /api/stats/{gameId}` — returns stat leaders for a specific game
- `GET /api/player-frame?u={streamUrl}` — redirects players to the isolated origin
- `GET|POST /api/embed?u={streamUrl}` — rewrites allowlisted provider documents
- `GET /api/media?u={mediaUrl}` — proxies allowlisted playlists and media

### Key files

- `lib/espn.ts` — fetches and normalizes game data from ESPN (5 leagues)
- `lib/streams/` — fetches stream links and bulk availability counts from stream providers
- `lib/types.ts` — shared types (`Game`, `Stream`, `League`, ESPN response types)
- `lib/metadata.ts` — static sport/league metadata and `teamColor()`
- `lib/game.ts` — `scoreView()` helper for score display logic
- `lib/scope.ts` — `applyScope()` and `statusCounts()` filtering helpers
- `lib/hooks.ts` — `useGameStreams()` client hook
- `components/App.tsx` — main client shell (state, polling, filtering, layout)
- `components/GameCard.tsx` — individual game card in the feed
- `components/GameFeed.tsx` — game grid grouped by league
- `components/WatchPanel.tsx` — right panel with iframe player, stream tabs, scorebox
- `components/Sidebar.tsx` — left rail sport/league navigation with live counts
- `components/TopBar.tsx` — header with brand, search, date nav, live count
- `components/StatsPanel.tsx` — player stat leaders panel
- `components/RelatedGames.tsx` — "also live" section inside WatchPanel
- `components/LiveTicker.tsx` — horizontal live games ticker bar
- `components/icons.tsx` — SVG icon components
