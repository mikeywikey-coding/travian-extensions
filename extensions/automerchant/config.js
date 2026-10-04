/**
 * Travian NPC Resource Helper - Configuration & Data
 *
 * Supports two server types:
 *   "classic"    — 3-tribe servers (Romans, Teutons, Gauls) with original costs
 *   "rebalanced" — 6-tribe servers (Community Week / Legends) with adjusted costs
 *                  for Romans/Gauls + Egyptians, Huns, Spartans
 *
 * NPC.TROOP_DATA is set at load time based on auto-detection.
 */

/* exported NPC */
/* eslint-disable no-redeclare */
var NPC = NPC || {};

NPC.CONFIG = {
	STEALTH: true,

	// Human-like delays between input value changes (milliseconds)
	INPUT_DELAYS: {
		RATIO: { MIN: 50, MAX: 350 }, // NPC ratio distribution (fast, same dialog)
		MARKET: { MIN: 500, MAX: 900 }, // Market send form (slower, external transfer)
		HERO: { MIN: 350, MAX: 500 }, // Hero inventory fill
	},
};

NPC.STORAGE_KEYS = {
	NEEDED_AMOUNTS: "_t4na",
	PENDING_TROOP: "_t4pt",
	AUTO_PULL: "_t4ap",
	INDICATOR_POS: "_t4ip",
};

NPC.RESOURCE_NAMES = ["Lumber", "Clay", "Iron", "Crop"];
NPC.RESOURCE_ICONS = [
	'<i class="r1"></i>',
	'<i class="r2"></i>',
	'<i class="r3"></i>',
	'<i class="r4"></i>',
];
NPC.RESOURCE_INPUT_NAMES = ["lumber", "clay", "iron", "crop"];

// ---- Shared troops (identical costs on both server types) ----

const _TEUTONS = {
	id: 2,
	name: "Teutons",
	troops: [
		{ name: "Clubswinger", unit: "u11", cost: [95, 75, 40, 40] },
		{ name: "Spearman", unit: "u12", cost: [145, 70, 85, 40] },
		{ name: "Axeman", unit: "u13", cost: [130, 120, 170, 70] },
		{ name: "Scout", unit: "u14", cost: [160, 100, 50, 50] },
		{ name: "Paladin", unit: "u15", cost: [370, 270, 290, 75] },
		{ name: "Teutonic Knight", unit: "u16", cost: [450, 515, 480, 80] },
		{ name: "Ram", unit: "u17", cost: [1000, 300, 350, 70] },
		{ name: "Catapult", unit: "u18", cost: [900, 1200, 600, 60] },
		{ name: "Chief", unit: "u19", cost: [35500, 26600, 25000, 27200] },
		{ name: "Settler", unit: "u20", cost: [5800, 4400, 4600, 5200] },
	],
};

const _GAULS = {
	id: 3,
	name: "Gauls",
	troops: [
		{ name: "Phalanx", unit: "u21", cost: [100, 130, 55, 30] },
		{ name: "Swordsman", unit: "u22", cost: [140, 150, 185, 60] },
		{ name: "Pathfinder", unit: "u23", cost: [170, 150, 20, 40] },
		{ name: "Theutates Thunder", unit: "u24", cost: [350, 450, 230, 60] },
		{ name: "Druidrider", unit: "u25", cost: [360, 330, 280, 120] },
		{ name: "Haeduan", unit: "u26", cost: [500, 620, 675, 170] },
		{ name: "Battering Ram", unit: "u27", cost: [950, 555, 330, 75] },
		{ name: "Trebuchet", unit: "u28", cost: [960, 1450, 630, 90] },
		{ name: "Chieftain", unit: "u29", cost: [30750, 45400, 31000, 37500] },
		{ name: "Settler", unit: "u30", cost: [4400, 5600, 4200, 3900] },
	],
};

const _EGYPTIANS = {
	id: 6,
	name: "Egyptians",
	troops: [
		{ name: "Slave Militia", unit: "u51", cost: [45, 60, 30, 15] },
		{ name: "Ash Warden", unit: "u52", cost: [115, 100, 145, 60] },
		{ name: "Khopesh Warrior", unit: "u53", cost: [170, 180, 220, 80] },
		{ name: "Sopdu Explorer", unit: "u54", cost: [170, 150, 20, 40] },
		{ name: "Anhur Guard", unit: "u55", cost: [360, 330, 280, 120] },
		{ name: "Resheph Chariot", unit: "u56", cost: [450, 560, 610, 180] },
		{ name: "Ram", unit: "u57", cost: [995, 575, 340, 80] },
		{ name: "Stone Catapult", unit: "u58", cost: [980, 1510, 660, 100] },
		{ name: "Nomarch", unit: "u59", cost: [34000, 50000, 34000, 42000] },
		{ name: "Settler", unit: "u60", cost: [5040, 6510, 4830, 4620] },
	],
};

const _HUNS = {
	id: 7,
	name: "Huns",
	troops: [
		{ name: "Mercenary", unit: "u61", cost: [130, 80, 40, 40] },
		{ name: "Bowman", unit: "u62", cost: [140, 110, 60, 60] },
		{ name: "Spotter", unit: "u63", cost: [170, 150, 20, 40] },
		{ name: "Steppe Rider", unit: "u64", cost: [290, 370, 190, 45] },
		{ name: "Marksman", unit: "u65", cost: [320, 350, 330, 50] },
		{ name: "Marauder", unit: "u66", cost: [450, 560, 610, 140] },
		{ name: "Ram", unit: "u67", cost: [1060, 330, 360, 70] },
		{ name: "Mangonel", unit: "u68", cost: [950, 1280, 620, 60] },
		{ name: "Logades", unit: "u69", cost: [37200, 27600, 25200, 27600] },
		{ name: "Settler", unit: "u70", cost: [6100, 4600, 4800, 5400] },
	],
};

const _SPARTANS = {
	id: 8,
	name: "Spartans",
	troops: [
		{ name: "Hoplite", unit: "u71", cost: [110, 185, 110, 35] },
		{ name: "Sentinel", unit: "u72", cost: [185, 150, 35, 75] },
		{ name: "Shieldsman", unit: "u73", cost: [145, 95, 245, 45] },
		{ name: "Twinsteel Therion", unit: "u74", cost: [130, 200, 400, 65] },
		{ name: "Elpida Rider", unit: "u75", cost: [555, 445, 330, 110] },
		{ name: "Corinthian Crusher", unit: "u76", cost: [660, 495, 995, 165] },
		{ name: "Ram", unit: "u77", cost: [525, 260, 790, 130] },
		{ name: "Ballista", unit: "u78", cost: [550, 1240, 825, 135] },
		{ name: "Ephor", unit: "u79", cost: [33450, 30665, 36240, 13935] },
		{ name: "Settler", unit: "u80", cost: [5115, 5580, 6045, 3255] },
	],
};

// ---- Classic 3-tribe server data (original costs) ----

NPC._TROOP_DATA_CLASSIC = {
	romans: {
		id: 1,
		name: "Romans",
		troops: [
			{ name: "Legionnaire", unit: "u1", cost: [120, 100, 150, 30] },
			{ name: "Praetorian", unit: "u2", cost: [100, 130, 160, 70] },
			{ name: "Imperian", unit: "u3", cost: [150, 160, 210, 80] },
			{ name: "Equites Legati", unit: "u4", cost: [140, 160, 20, 40] },
			{ name: "Equites Imperatoris", unit: "u5", cost: [550, 440, 320, 100] },
			{ name: "Equites Caesaris", unit: "u6", cost: [550, 640, 800, 180] },
			{ name: "Battering Ram", unit: "u7", cost: [900, 360, 500, 70] },
			{ name: "Fire Catapult", unit: "u8", cost: [950, 1350, 600, 90] },
			{ name: "Senator", unit: "u9", cost: [30750, 27200, 45000, 37500] },
			{ name: "Settler", unit: "u10", cost: [4600, 4200, 5800, 4400] },
		],
	},
	teutons: _TEUTONS,
	gauls: _GAULS,
};

// ---- 5-tribe server data (classic costs + Egyptians + Huns) ----
// These servers added Egyptians/Huns to the classic 3-tribe pool but did NOT
// adopt the Community Week / Legends cost rebalance — so Romans/Gauls keep
// their original costs. Only the rebalanced 6-tribe edition (with Spartans)
// uses the adjusted costs.

NPC._TROOP_DATA_FIVE = {
	romans: NPC._TROOP_DATA_CLASSIC.romans,
	teutons: _TEUTONS,
	gauls: _GAULS,
	egyptians: _EGYPTIANS,
	huns: _HUNS,
};

// ---- Rebalanced 6-tribe server data (Community Week / Legends) ----

NPC._TROOP_DATA_REBALANCED = {
	romans: {
		id: 1,
		name: "Romans",
		troops: [
			{ name: "Legionnaire", unit: "u1", cost: [100, 80, 130, 30] },
			{ name: "Praetorian", unit: "u2", cost: [100, 120, 150, 60] },
			{ name: "Imperian", unit: "u3", cost: [150, 160, 210, 80] },
			{ name: "Equites Legati", unit: "u4", cost: [140, 160, 20, 40] },
			{ name: "Equites Imperatoris", unit: "u5", cost: [480, 380, 280, 80] },
			{ name: "Equites Caesaris", unit: "u6", cost: [550, 640, 800, 180] },
			{ name: "Battering Ram", unit: "u7", cost: [900, 360, 500, 70] },
			{ name: "Fire Catapult", unit: "u8", cost: [950, 1350, 600, 90] },
			{ name: "Senator", unit: "u9", cost: [30750, 27200, 45000, 37500] },
			{ name: "Settler", unit: "u10", cost: [4600, 4200, 5800, 4400] },
		],
	},
	teutons: _TEUTONS,
	gauls: _GAULS,
	egyptians: _EGYPTIANS,
	huns: _HUNS,
	spartans: _SPARTANS,
};

// ---- Server type detection & active data ----

// Travian tribe id → our internal troop-data key. 4 (Nature) and 5 (Natars)
// are non-playable so they're skipped. Any future tribe id we don't have
// data for is filtered out by the lookup below.
NPC._TRIBE_ID_TO_KEY = {
	1: "romans",
	2: "teutons",
	3: "gauls",
	6: "egyptians",
	7: "huns",
	8: "spartans",
};

/**
 * Scan inline <script> blocks for the React hydration `viewData:` payload and
 * return the first non-empty buildings[].validTribes list. Some pages (e.g.
 * /build.php?gid=16) ship an empty buildings array; dorf1 always has a
 * populated one. The payload is large, so it is regex-searched from the
 * "buildings" key instead of being JSON-parsed whole.
 *
 * @returns {number[]|null} validTribe ids, or null if nothing was found.
 */
NPC._readValidTribeIds = function () {
	for (const script of document.querySelectorAll("script:not([src])")) {
		const text = script.textContent;
		const vd = text.indexOf("viewData:");
		if (vd === -1) continue;
		const buildings = text.indexOf('"buildings"', vd);
		if (buildings === -1) continue;
		const m = /"validTribes"\s*:\s*\[\s*(\d[\d,\s]*)\]/.exec(text.slice(buildings));
		if (m) return m[1].split(",").map(Number);
	}
	return null;
};

// localStorage key for the per-server tribe id cache. The validTribes list
// only lives on dorf1 (and a few other pages) — building/training pages
// often ship an empty buildings array — so we persist the dorf1 reading
// and reuse it everywhere on the same server.
NPC._VALID_TRIBES_CACHE_KEY = "_t4vt";

NPC._loadCachedTribeIds = function () {
	try {
		const raw = localStorage.getItem(NPC._VALID_TRIBES_CACHE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw);
		if (data && data.host === location.host && Array.isArray(data.ids)) {
			return data.ids;
		}
	} catch {}
	return null;
};

NPC._saveCachedTribeIds = function (ids) {
	try {
		localStorage.setItem(
			NPC._VALID_TRIBES_CACHE_KEY,
			JSON.stringify({ host: location.host, ids }),
		);
	} catch {}
};

/**
 * Returns the active server type for cost rules. Three distinct editions:
 *   - "classic"    — pure 3-tribe (ids 1/2/3), original costs.
 *   - "fivetribe"  — 3 classic tribes + Egyptians/Huns. Same original
 *                    costs for Romans/Gauls; Egyptians/Huns use their own.
 *                    The Community Week cost rebalance is NOT applied here.
 *   - "rebalanced" — full 6-tribe (Community Week / Legends) with Spartans
 *                    AND the adjusted Roman/Gaul costs.
 *
 * Side effect: also caches the detected tribe id list on NPC.validTribeIds
 * (in-memory + localStorage) so applyServerType can filter the dropdown
 * correctly. Detection reads dorf1's viewData; on pages where viewData
 * doesn't include the buildings list we fall back to the cached value.
 */
NPC.detectServerType = function () {
	let ids = NPC._readValidTribeIds();
	if (ids) {
		NPC._saveCachedTribeIds(ids);
	} else {
		ids = NPC._loadCachedTribeIds();
	}
	NPC.validTribeIds = ids;
	if (!ids) return "classic";

	if (ids.includes(8)) return "rebalanced";
	if (ids.some((id) => id > 3)) return "fivetribe";
	return "classic";
};

/** Current server type: "classic" or "rebalanced" */
NPC.serverType = "classic";

/** Tribe ids enabled on this server (e.g. [1,2,3,6,7]). null = unknown. */
NPC.validTribeIds = null;

/** Active troop data (set by applyServerType) */
NPC.TROOP_DATA = NPC._TROOP_DATA_CLASSIC;

/**
 * Switch the active troop data to match the given server type. When
 * NPC.validTribeIds is known (populated by detectServerType), the chosen
 * cost set is filtered down to only the tribes this server actually
 * enables — so 5-tribe servers don't see Spartans in the dropdown even
 * if the user manually selects "Rebalanced".
 * @param {"classic"|"fivetribe"|"rebalanced"} type
 */
NPC.applyServerType = function (type) {
	NPC.serverType = type;
	let src;
	if (type === "rebalanced") src = NPC._TROOP_DATA_REBALANCED;
	else if (type === "fivetribe") src = NPC._TROOP_DATA_FIVE;
	else src = NPC._TROOP_DATA_CLASSIC;

	if (!Array.isArray(NPC.validTribeIds)) {
		NPC.TROOP_DATA = src;
		return;
	}

	const allowedKeys = new Set(
		NPC.validTribeIds
			.map((id) => NPC._TRIBE_ID_TO_KEY[id])
			.filter(Boolean),
	);
	const filtered = {};
	for (const key of Object.keys(src)) {
		if (allowedKeys.has(key)) filtered[key] = src[key];
	}
	// Fallback: if the filter produced nothing (unknown tribe ids only),
	// fall back to the unfiltered cost set rather than show an empty
	// dropdown.
	NPC.TROOP_DATA = Object.keys(filtered).length > 0 ? filtered : src;
};
