/**
 * Travian NPC Resource Helper - Tribe Auto-Detection
 * Detects the player's tribe from the page without requiring manual selection.
 *
 * Travian tribe IDs: 1 = Romans, 2 = Teutons, 3 = Gauls, 5 = Egyptians, 6 = Huns, 7 = Spartans
 * @global NPC
 *
 * Detection methods (in priority order):
 * 1. Travian JS globals (Travian.Game.tribe, etc.)
 * 2. Inline script parsing for tribe assignment
 * 3. Unit CSS classes on troop images (ux = Roman, u1x = Teuton, u2x = Gaul)
 * 4. Profile/sidebar tribe indicator elements
 */

NPC.TribeDetector = {
	_detected: null,
	_TRIBE_MAP: {
		1: "romans",
		2: "teutons",
		3: "gauls",
		5: "egyptians",
		6: "huns",
		7: "spartans",
	},

	/** Returns the faction key ('romans'|'gauls'|'teutons'|'egyptians'|'huns'|'spartans') or null. */
	detect() {
		if (this._detected) return this._detected;

		const tribeId = this._fromUnitClasses();

		if (tribeId && this._TRIBE_MAP[tribeId]) {
			this._detected = this._TRIBE_MAP[tribeId];
			NPC.log.success(`Tribe detected: ${this._detected} (id ${tribeId})`);
			return this._detected;
		}

		NPC.log.warn("Could not auto-detect tribe");
		return null;
	},

	// --- Detection strategy ---

	_fromUnitClasses() {
		// Broaden the selector to catch any class starting with ' u' (the regex will do the strict filtering)
		const unitEls = document.querySelectorAll('[class*=" u"]');
		const counts = { 1: 0, 2: 0, 3: 0, 5: 0, 6: 0, 7: 0 };

		for (const el of unitEls) {
			// Extract the full 1 or 2 digit unit number (e.g., '5' from 'u5', '21' from 'u21')
			const match = el.className.match(/\bu(\d{1,2})\b/);
			if (!match) continue;

			const unitId = Number(match[1]);

			// Map the exact unit ID range to the corresponding tribe ID
			if (unitId >= 1 && unitId <= 10) counts[1]++;
			else if (unitId >= 11 && unitId <= 20) counts[2]++;
			else if (unitId >= 21 && unitId <= 30) counts[3]++;
			else if (unitId >= 51 && unitId <= 60) counts[5]++;
			else if (unitId >= 61 && unitId <= 70) counts[6]++;
			else if (unitId >= 71 && unitId <= 80) counts[7]++;
		}

		// Return the tribe with the most matches
		let best = null,
			bestCount = 0;
		for (const [id, count] of Object.entries(counts)) {
			if (count > bestCount) {
				best = Number(id);
				bestCount = count;
			}
		}
		return bestCount > 0 ? best : null;
	},
};
