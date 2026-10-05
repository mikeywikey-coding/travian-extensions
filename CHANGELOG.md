# Changelog

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
