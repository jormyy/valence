# Criticality Loop — main (2026-05-22)

base: main  •  aggressiveness: aggressive  •  test: agent-browser + next build  •  converge: 2

baseline: build green; lint warnings present (multiple `@typescript-eslint/no-explicit-any` disables in lib/espn.ts + app/api/stats); no test suite.
source LOC: 1665 across 17 files (app/ + components/ + lib/)

| # | verdict | findings (C/I/O) | commits | LOC Δ | tests | notes |
|---|---|---|---|---|---|---|
| 1 | BLOCK | 5/3/1 + 2 slop | 1 | -262 | ✅ build + ✅ agent-browser | killed /event/[id] (-141), centralized ESPN types (-10 any disables), extracted icons.tsx, decomposed WatchPanel 270→128, used teamColor from metadata everywhere, GameWithStreams to types.ts |
| 2 | BLOCK | 5/5/5 + 4 slop | 1 | +32 | ✅ build + ✅ agent-browser | new lib/game.ts (scoreView), lib/scope.ts (applyScope/statusCounts), lib/hooks.ts (useGameStreams), attachStreamCounts helper; export PT_TZ + STATUS_ORDER; icons stroke split; log fetch errors |
| 3 | BLOCK | 3/5/1 + 3 slop | 1 | -2 | ✅ build + ✅ agent-browser | dateLabels live (no midnight calcify), Sidebar uses statusCounts via groupBy, App counts simplified, log poll errors, ?? for score fallback. Declined: premature memoization of teamColor, merge of now-tick+poll (semantically different), auto-select-hook extract (3 lines) |
