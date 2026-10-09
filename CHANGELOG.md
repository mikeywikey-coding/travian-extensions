# Changelog

## Rank Tracker 4.8.2 — 2026-10-05

- Preserve reset boundaries when opening the popup; save direct page observations to history.
- Separate fresh weekly observations from cached background values; rates skip missing observations.
- Serialize snapshot/restore writes; reject older completed fetches and pin each popup to its server.
- Validate backups before writing, retain existing storage if the write fails, sort imported history, and discard derived income caches. Restore is available before login or network collection.
- Fix accidental filter handlers, repeated group handlers, stale chart loads, invalid zoom ranges, and excessive interpolation across history gaps.
- Reject unrelated statistics tables as population/weekly data, prefer fresh fields over cached values, handle JSON string braces and signed numbers, and reject pages without usable statistics.
- Correct raid-income averages across missing values and resets; publish the observation timestamp rather than the current page-load time.
- Refresh hourly production from parsed daily production, display zero general values, correct rank-tier help, and avoid caching a false playtime anchor when the oldest inbox page fails.

## Rank Tracker 4.8.1 — 2026-10-05

- Fixed reset-related negative value changes in Current comparisons (including since last open) and History tooltip, selection, and velocity calculations.
- Detect counter drops from observations instead of relying on local Monday midnight; bridge multiple observed resets and skip missing samples. Daily bounty resets are handled in History.
- Preserve pre-reset history within the deduplication window and keep valid zero raid values instead of replacing them with legacy values.
- Existing history is handled on display; no data reset is required. Unobserved gains cannot be reconstructed.

## Night Mode 2.4 — 2026-10-04

- Darkened the alliance "Contribute resources" header and box outline.

## Night Mode 2.3 — 2026-10-04

- Darkened the alliance bonus section headers and the box outlines.

## Night Mode 2.2 — 2026-10-04

- Redrew the alliance bonus level markers as rings on the dark track for every state: unreached, reached, complete, inactive and upgrading. In 2.1 they still showed grey boxes.
- Dimmed the inactive bonus bar fill.

## Night Mode 2.1 — 2026-10-04

- Darkened the unreached level markers and bar outline on the alliance bonus page.
- Darkened your own row in the alliance bonus top-5 contributor tables.

## Travian QoL 1.0 — 2026-10-04

- Updated the manifest and documentation version from 0.1.0 to 1.0.

## Initial community beta — 2026-10-04

- Published the eight currently enabled extensions as independent unpacked packages.
- Added installation, feature guides, sample-data screenshots, issue templates, and Discord contact `luckimikey`.
- Included the recent TravAlarm village-navigation fix.
- Included oasis farm-list sorting by bonus type, then distance within the same type.
- Included QoL's right-click action to open selected farm targets in background tabs.

Version numbers are retained from the installed manifests. Future changes should identify which extension changed.
