# Rank Tracker audit — 2026-10-05

Scope: shared parsing/persistence, popup startup, Current comparisons, History graphs, backup/restore, and the raid-income bridge. Fixes shipped in 4.8.2 after static source review.

## Confirmed defects addressed

| Area | Trigger and defect | Change |
| --- | --- | --- |
| Reset history | Opening the popup deleted all but one observation per half-hour, undoing reset preservation | Removed destructive read-time cleanup |
| Direct page capture | Statistics-page observations updated latest but never history | Use the normal snapshot persistence path |
| Weekly freshness | Background workers carried cached weekly values into new history timestamps | Record weekly observation time and omit carried fields from new history |
| Missing samples | Weekly velocity disappeared with general-only observations in between | Calculate rates from the previous finite observation and actual elapsed time |
| Persistence | Concurrent popup/worker read-modify-write cycles could lose history or replace newer snapshots | Shared storage lock and timestamp ordering; preserve newer weekly cache |
| Server selection | Another popup could change the global server selection under an existing baseline | Pin the server for each popup session and validate supported origins |
| Restore | Invalid JSON shape or failed write could wipe existing data after clear | Validate before mutation; write before removing stale keys |
| Import lifecycle | Restore handlers were registered after network work or skipped without a server | Register controls at startup; import page skips collection |
| Imported history | Unsorted observations and imported summary caches could produce wrong derived results | Sort observations and rebuild raid-income caches |
| Parsing | Unrelated statistics tables could be interpreted as weekly or population tables | Explicit page context and supported table layout guards |
| Fresh fields | Cached values prevented fresh DOM fallback fields from taking effect | Give fresh JSON/DOM fields precedence over cache |
| Empty pages | A non-statistics response could be saved as a successful fresh observation | Reject responses without usable statistics |
| JSON | Braces and escaped quotes inside string values confused brace matching | Track strings and escapes |
| Numbers | Minus signs were stripped; nonfinite numbers and partial suffix tokens were accepted | Preserve signs and validate numeric tokens |
| Charts | Modal/group buttons were also registered as filter buttons | Bind filters only to data-f controls |
| Chart lifecycle | Repeated loads accumulated handlers referring to destroyed charts | Replace handlers and guard stale asynchronous loads |
| Chart ranges | Raw-data zoom indices could blank daily charts; huge gaps could allocate excessive points | Reset/check zoom and bound interpolation |
| Income summary | Null counters were coerced to zero; reset intervals were excluded; old data was stamped as fresh | Skip invalid samples, count post-reset gains, publish observation timestamp |
| Production/zero values | Hourly production remained stale without DOM parsing; zero values disappeared | Derive hourly production from daily JSON totals and render zero |
| Playtime/help | Failed last-page fetch could permanently cache a newer message as account start; help showed outdated tiers | Avoid caching failed fallback and correct tier thresholds |

## Verification and limits

- JavaScript syntax checks, diff whitespace checks, independent static review, and checkout hash comparison. Tests and live-browser checks were not run under the repository instruction to run tests only when requested.
- No new game endpoints, polling, or game-state actions were added. Changes concern parsing, local storage, existing collection paths, and extension UI.
- Weekly HTML tables still cannot be parsed by the background service worker. Opening the popup refreshes them; the weekly section tooltip reports its observation time.
- Previously deleted observations and wholly unobserved resets cannot be reconstructed. Recorded gains are estimates across gaps.
- The oldest available system message remains an approximation of account start if the original message was deleted. Server timezone/localized message-date handling needs live source evidence before changing it.
- This is a bounded static audit, not a guarantee that every runtime defect is eliminated. Browser/session-specific collection behavior remains unverified.
