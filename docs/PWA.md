# Using Valence as a PWA

Valence can be installed like a native app. Install prompts only appear over **HTTPS** (or `localhost`) — a plain-HTTP deployment won't offer them.

## Installing

**Desktop (Chrome / Edge / Brave)**
1. Open the site.
2. Click the install icon at the right end of the address bar (a monitor with a down-arrow), or menu → "Install Valence…".
3. The app opens in its own window with its own dock/taskbar icon.

**Android (Chrome)**
1. Open the site.
2. Tap ⋮ → "Add to Home screen" → "Install".

**iPhone / iPad (Safari)**
1. Open the site.
2. Tap the Share button → "Add to Home Screen".
   (iOS doesn't show an automatic prompt; this manual step is the only way.)

## What you get

- Standalone window — no browser chrome, dark theme-colored title bar.
- **Offline behavior**: the last-loaded games and scores still display with no
  connection; pages never visited show a "You're offline" screen with a Retry
  button. Streams themselves require a connection.
- Game data is always fetched fresh from the network when online — the cache
  is only a fallback.

## Updating

The service worker (`public/sw.js`) takes over immediately on deploy
(`skipWaiting`). Hashed build assets get new URLs each deploy, so users pick
up new code on their next page load. If caching behavior itself changes, bump
the `VERSION` constant in `sw.js` — old caches are deleted on activate.

## Developing

- The service worker registers **only in production builds**
  (`npm run build && npm run start`). `npm run dev` never registers it, so
  development is never affected by stale caches.
- If a stale worker ever bothers you locally: DevTools → Application →
  Service Workers → Unregister, and Clear storage.

## Files

| File | Role |
|---|---|
| `app/manifest.ts` | Web app manifest (name, icons, colors, display mode) |
| `public/sw.js` | Service worker — caching strategies and offline fallback |
| `public/offline.html` | Offline fallback page |
| `components/ServiceWorkerRegistration.tsx` | Registers the worker in production |
| `public/icon-*.png`, `apple-touch-icon.png` | Installable app icons |
