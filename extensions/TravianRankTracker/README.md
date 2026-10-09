# Travian Rank Tracker

Version 4.8.2.

[Features and usage guide](../../README.md#rank-tracker) · [Installation](../../README.md#install-in-brave-chrome-or-edge)

Load this folder directly with **Load unpacked**. No build step is required.

Issues or suggestions: Discord **`luckimikey`**, or a GitHub issue in this repository.

Weekly value changes follow observed counter resets for all Current comparisons and History tooltip, selection, and velocity calculations. Daily bounty resets are handled in History too. Absolute charts still show the original period totals; ranks and other statistics retain signed changes.

Gains are based on saved observations: activity during gaps or completely unobserved resets cannot be reconstructed. No history deletion or re-import is needed.

Weekly tables refresh in the popup. Background workers collect the JSON-backed general statistics but cannot parse weekly HTML tables; hover the weekly section for its last observation time. Stored history omits cached weekly values, and rates span the available observations.

Backup imports are validated before writing. Failed writes leave existing data intact. Open the restore button even without a registered server.

See [audit findings and verification limits](../../docs/rank-tracker-audit.md).
