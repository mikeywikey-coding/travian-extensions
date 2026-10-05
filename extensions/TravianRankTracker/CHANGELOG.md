# Travian Rank Tracker v5.0 — Refactor Changelog

## Rank Tracker 4.8.1 — 2026-10-05

- Fixed reset-related negative value changes in Current comparisons (including since last open) and History tooltip, selection, and velocity calculations.
- Detect counter drops from observations instead of relying on local Monday midnight; bridge multiple observed resets and skip missing samples. Daily bounty resets are handled in History.
- Preserve pre-reset history within the deduplication window and keep valid zero raid values instead of replacing them with legacy values.
- Existing history is handled on display; no data reset is required. Unobserved gains cannot be reconstructed.

## v4.8.0 — Playtime anchored to game start

- Playtime timer now starts from the received-time of the first Travian system
  message ("TG Support") in the inbox — i.e. when the account actually started
  on the server — instead of the first tracker snapshot.
- New `fetchGameStart()` in utils.js: fetches `/messages/inbox` (last page when
  paginated), takes the oldest `tr.support` row, parses its `td.dat` label
  ("today, 17:09" / "yesterday, …" / "dd.mm.yy, …") via `parseTravianDate()`.
- Fetched at most once per server; stored in a `gameStart_{origin}` key.
  Falls back to the old `firstSeen_{origin}` anchor, then oldest history entry.

---

## v4.7.0 — Rebalanced Rank Tiers

- Reworked `RANK_TIERS` so the elite tiers are genuinely rare and the middle is
  no longer a free ride. Old curve gave diamond to the entire top 10% and gold
  all the way down to the 40th percentile.
- **Denominator changed to active accounts.** Percentiles now divide by
  `villageStrength.totalPlayers` (players with ≥1 village, ~14.6k) instead of
  `activatedPlayers` (every avatar ever created, ~18.4k, incl. dead accounts).
  Falls back to the old avatars count if the field is missing.
- New percentile cutoffs (as a fraction of active accounts):
  immortal 0.45% · ascended 0.9% · diamond 2% · emerald 3% · platinum 6%
  · gold 14% · silver 20% · bronze 30% · iron rest.
- Net effect: a rank in the top ~12% of active players reads as **gold**, and
  iron covers the bottom ~70%.

---

## v4.6.0 — Playtime

- **New:** Header now shows playtime — elapsed time since the first recorded
  snapshot for the current server (e.g. `⏱ 4d 6h`).
- Anchored to a never-trimmed `firstSeen_{origin}` key written once in
  `saveToHistory`, so it stays correct past the ~41-day history cap.

---

## 🐛 Bug Fix: Data Gap During Sleep

### Root Cause
Two compounding issues caused the 3am→wake gap on the graph:

1. **Missing `onStartup` listener** — The periodic alarm was only registered inside
   `runtime.onInstalled`, which fires on install/update but **not** on browser restart.
   If Firefox restarted overnight, the alarm was never recreated, and background
   fetching silently stopped forever.

2. **Silent session-expiry discard** — When the Travian session cookie expired
   (inevitable overnight), `fetchForServer` detected the login page
   (`name="login"`) and executed a bare `return` — no logging, no diagnostic
   marker, nothing saved.  Every subsequent 30-minute alarm tick hit the same
   wall and discarded the result, producing the blank stretch on the graph.

### Fixes Applied
- Added `runtime.onStartup` — alarm is now guaranteed on every browser launch.
- Added `ensureAlarm()` — called on install, startup, AND on every alarm tick
  (belt-and-suspenders) to recover from any browser-level alarm loss.
- Every fetch now writes a diagnostic status to storage
  (`lastFetchStatus_{origin}`) so the popup can tell the user "Session expired —
  please log in" instead of silently showing stale data.

---

## 🔧 Refactoring Summary

### utils.js
- **New `fetchAllEndpoints()`** — single entry-point for the full 4-endpoint
  server scrape (general → overview → production → top10).  This eliminates
  the copy-paste between `background.js:fetchForServer` and `popup.js:fetchData`
  that previously existed.
- **New `mergeFields()` helper** — replaces the repetitive per-key if-null
  checks with a clean loop.
- **Extracted constants** — `DEDUP_WINDOW_MS`, `MAX_HISTORY_LEN`, `WEEKLY_KEYS`
  are now named and documented.
- **JSDoc comments** on every public function.
- **Table-index extraction** deduplicated — the "PvP / Defenders / PvE / Robbers"
  slot mapping was copy-pasted 3 times; now expressed once as a data-driven loop.

### background.js
- **`ensureAlarm()`** — idempotent; safe to call repeatedly, only creates
  alarm if missing.
- **`runtime.onStartup`** — ensures alarm survives browser restarts.
- **Removed all fetch logic** — delegates entirely to `fetchAllEndpoints()`.
- **Reduced from ~100 LOC to ~118 LOC** despite adding features (docs take space).

### popup.js
- **`fetchAndRender()`** replaces the old `fetchData()`** — wraps the shared
  `fetchAllEndpoints()` and maps status codes to user-facing error messages.
- **`DATASETS_CONFIG` array** — the 14-dataset chart configuration is now a
  declarative data structure instead of 14 inline object literals.
- **`aggregateDaily()` / `interpolateGaps()`** — the 60-line inline blocks
  in `loadGraph()` are now standalone, testable functions.
- **`initChartZoom()`** — the 70-line wheel listener is extracted into its
  own function with clearer variable names.
- **`setUpdateStatus()`** — small helper to avoid the repeated
  `document.getElementById('last-update')` pattern.
- **Section headers** with §-numbered JSDoc blocks for navigability.
- **Removed redundant `api` re-declarations** — the popup now declares `api`
  once at module scope.

### Unchanged files
- `popup.html`, `style.css`, `chart.js`, `icon128.png` — no changes.
- `manifest.json` — version bumped to 5.0.0, formatting cleaned up.
