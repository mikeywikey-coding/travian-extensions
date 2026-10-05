/**
 * Travian Rank Tracker — Shared Utilities (v5.0)
 *
 * This module provides every data-extraction and persistence function used by
 * both the background worker and the popup UI.  It is intentionally kept free
 * of DOM-dependent rendering so it can safely run in service-worker contexts
 * where `DOMParser` is unavailable (it degrades gracefully).
 *
 * Architecture overview:
 *   Storage keys per server:
 *     history_{origin}  — ordered array of snapshot objects (the graph source)
 *     latest_{origin}   — single object: the most recent merged snapshot
 *     lastFetchStatus_{origin} — diagnostic: { timestamp, ok, reason }
 *
 * Change-log (v5.0):
 *   - Consolidated merge helpers to eliminate copy-paste between bg/popup.
 *   - Added `fetchAllEndpoints()` — single entry-point for a full server scrape.
 *   - `saveToHistory` now uses a configurable dedup window (default 10 min).
 *   - Every public function has JSDoc comments.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   §1  NUMBER / STRING HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Parse a "human-friendly" number string (e.g. "1.2k", "3M", "12,345")
 * into a plain integer.  Returns null when the input is empty or unparsable.
 *
 * @param {string|number} str - The raw text to parse.
 * @returns {number|null}
 */
function cleanSmartNum(str) {
	if (typeof str === "number") return str;
	if (!str) return null;

	str = str
		.toString()
		.replace(/<[^>]*>/g, "")
		.trim()
		.toLowerCase();

	// SI-suffix shorthand (e.g. "12.3k" or "1.5m")
	const suffixes = { k: 1_000, m: 1_000_000 };
	for (const [letter, factor] of Object.entries(suffixes)) {
		if (str.includes(letter)) {
			str = str.replace(letter, "").replace(",", ".");
			const val = parseFloat(str);
			return isNaN(val) ? null : Math.round(val * factor);
		}
	}

	// Thousands-separator detection: "1.234" with exactly 3 digits after "."
	if (/\.\d{3}\b/.test(str)) str = str.replace(/\./g, "");

	const digits = str.replace(/[^0-9]/g, "");
	return digits ? parseInt(digits, 10) : null;
}

/**
 * Format an elapsed-time duration (ms) into a compact human label.
 *   >= 1 day  -> "Xd Yh"
 *   >= 1 hour -> "Yh Zm"
 *   else      -> "Zm"   (floored, never negative)
 *
 * @param {number} ms - Elapsed milliseconds.
 * @returns {string}
 */
function formatDuration(ms) {
	if (!(ms > 0)) return "0m";
	const totalMin = Math.floor(ms / 60000);
	const days = Math.floor(totalMin / 1440);
	const hours = Math.floor((totalMin % 1440) / 60);
	const mins = totalMin % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

/** Accumulate observed gains from a resetting counter, skipping missing samples.
 * A decrease starts a new period. Unobserved gains cannot be recovered.
 * Callers supply chronological samples; never use this for ranks or strength.
 */
function counterTotals(samples, readValue) {
	let previous = null;
	let total = 0;
	return samples.map((sample) => {
		const value = readValue(sample);
		if (!Number.isFinite(value) || value < 0) return null;
		total += previous == null || value < previous ? value : value - previous;
		previous = value;
		return total;
	});
}

function top10Value(snapshot, label) {
	const item = snapshot?.top10?.find((entry) => entry.label === label);
	return item ? cleanSmartNum(item.val) : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §2  HTML → DATA EXTRACTORS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Extract data embedded in Travian's React hydration payload (`viewData:{…}`).
 * Works without DOMParser — uses raw string scanning + JSON.parse.
 *
 * @param {string} html - Full page HTML.
 * @returns {Object|null} Extracted fields, or null on failure.
 */
function extractReactData(html) {
	try {
		const marker = "viewData:";
		const startIdx = html.indexOf(marker);
		if (startIdx === -1) return null;

		// Walk forward to the opening brace
		let cursor = startIdx + marker.length;
		while (cursor < html.length && html[cursor] !== "{") cursor++;

		// Brace-match to find the full JSON object
		let depth = 0;
		let jsonEnd = -1;
		const jsonStart = cursor;
		for (let i = cursor; i < html.length; i++) {
			if (html[i] === "{") depth++;
			else if (html[i] === "}") depth--;
			if (depth === 0) {
				jsonEnd = i + 1;
				break;
			}
		}
		if (jsonEnd === -1) return null;

		const data = JSON.parse(html.substring(jsonStart, jsonEnd));
		const res = {};

		// Population rank
		const popRanks = data.populationRank?.serverRank;
		if (popRanks?.length) {
			res.rankPop = popRanks[popRanks.length - 1].rank;
		}

		// Production / resource rank
		const rr = data.resourceRank;
		if (rr) {
			res.rankProd = rr.rankDaily?.server ?? null;
			res.rankProdSoFar = rr.rank?.server ?? null;
			const p = rr.production?.perDay;
			if (p)
				res.pointsProd = (p.r1 || 0) + (p.r2 || 0) + (p.r3 || 0) + (p.r4 || 0);
			if (rr.positive?.sum !== undefined) {
				res.valProdSoFar = rr.positive.sum;
			}
			if (rr.positive?.raid !== undefined) {
				res.valBounty = rr.positive.raid;
			}
		}

		// Culture points
		const cpDay = data.culturePointsRank?.rank?.perDay;
		if (cpDay) {
			res.rankCp = cpDay.serverRank;
			res.cpProd = cpDay.cpProduction;
		}
		const cpSoFar = data.culturePointsRank?.rank?.soFar;
		if (cpSoFar) {
			res.rankCpSoFar = cpSoFar.serverRank;
			res.valCpSoFar = cpSoFar.cpProduction;
		}

		// Active accounts (players with ≥1 village) — the denominator for percentile
		// rank coloring. `villageStrength.totalPlayers` excludes deleted / abandoned /
		// never-built avatars. Falls back to lifetime avatars created if it's missing.
		const totalPlayers =
			data.villageStrength?.totalPlayers ??
			data.culturePointsRank?.totalPlayers ??
			data.serverProgression?.timeLine?.activatedPlayers ??
			null;
		if (totalPlayers != null) res.totalPlayers = totalPlayers;

		// Village strength (offence / defence)
		const vs = data.villageStrength;
		if (vs) {
			if (vs.defenceRanks) res.rankDef = vs.defenceRanks.server;
			if (vs.defenceStrength) {
				res.pointsDef = Math.ceil(
					vs.defenceStrength.reduce((sum, v) => sum + (v.strength || 0), 0),
				);
			}

			// Find the single strongest offensive village
			let maxOff = -1;
			let maxVillageId = null;
			if (vs.offenceStrength) {
				for (const v of vs.offenceStrength) {
					if (v.strength > maxOff) {
						maxOff = v.strength;
						maxVillageId = v.villageId;
					}
				}
				if (maxOff > -1) res.pointsOff = Math.ceil(maxOff);
			}

			// Offensive rank: prefer the rank from the strongest village
			if (maxVillageId && vs.villages?.[maxVillageId]?.offenceRanks) {
				res.rankOff = vs.villages[maxVillageId].offenceRanks.server;
			} else if (vs.offenceRanks) {
				res.rankOff = vs.offenceRanks.server;
			}
		}

		return res;
	} catch {
		return null;
	}
}

/**
 * DOM-based extraction from the /statistics/general page (and partially the
 * /statistics/player/top10 page when tables are present).
 *
 * Returns early with a skeleton object when `DOMParser` is not available
 * (e.g. inside a service-worker).
 *
 * @param {string} html - Full page HTML.
 * @returns {Object} Parsed data with a `foundTop10` flag.
 */
function parseStatsRobust(html) {
	const res = { foundTop10: false, top10List: [] };
	if (typeof DOMParser === "undefined") return res;

	const doc = new DOMParser().parseFromString(html, "text/html");

	// Rank badges (e.g. .rankDisplay.Population)
	const getRank = (cls) => {
		const el = doc.querySelector(`.rankDisplay.${cls}`);
		return el ? cleanSmartNum(el.innerText) : null;
	};
	res.rankPop = getRank("Population");
	res.rankProd = getRank("Production");
	res.rankCp = getRank("CPperDay");
	res.rankOff = getRank("Offensive");
	res.rankDef = getRank("Defensive");

	// Inline icons for strength values
	const icons = Array.from(doc.querySelectorAll(".inlineIcon i"));
	const findIcon = (pattern) =>
		icons.find((i) => i.className.includes(pattern));

	const defIcon = findIcon("defence_medium") || findIcon("def_medium");
	if (defIcon?.nextElementSibling)
		res.pointsDef = cleanSmartNum(defIcon.nextElementSibling.innerText);

	const offIcon = findIcon("offence_medium") || findIcon("off_medium");
	if (offIcon?.nextElementSibling)
		res.pointsOff = cleanSmartNum(offIcon.nextElementSibling.innerText);

	// CP production value
	const cpDiv = doc.querySelector(".cpProduction");
	if (cpDiv) res.cpProd = cleanSmartNum(cpDiv.innerText);

	// Population from the overview table
	const tables = doc.querySelectorAll("table");
	for (const table of tables) {
		const own = table.querySelector("tr.own") || table.querySelector("tr.hl");
		if (!own) continue;
		const popCell = own.querySelector(".pop");
		if (popCell) {
			res.valPop = cleanSmartNum(popCell.innerText);
			res.rankPop =
				cleanSmartNum(own.querySelector(".ra")?.innerText) || res.rankPop;
			break;
		}
	}

	// Fallback: first table might have val in a different column
	if (!res.valPop && tables[0]) {
		const own =
			tables[0].querySelector("tr.own") || tables[0].querySelector("tr.hl");
		if (own) {
			const v = cleanSmartNum(
				own.querySelector(".val.lc")?.innerText ||
					own.querySelector(".val")?.innerText,
			);
			if (v) res.valPop = v;
		}
	}

	// Weekly Top-10 tables
	const extractRow = (table, label) => {
		if (!table) return null;
		const own = table.querySelector("tr.own") || table.querySelector("tr.hl");
		if (!own) return null;
		const r = cleanSmartNum(own.querySelector(".ra")?.innerText);
		const v = cleanSmartNum(
			own.querySelector(".val.lc")?.innerText ||
				own.querySelector(".val")?.innerText,
		);
		if (r) {
			res.top10List.push({ label, rank: r, val: v });
			return { rank: r, val: v };
		}
		return null;
	};

	if (tables.length > 0) {
		// Table index varies: 4-table layout vs 5-table layout
		const offset = tables.length === 4 ? 0 : 1;
		const slots = [
			{ idx: offset, label: "PvP of the week", rankKey: "rankPvp" },
			{
				idx: offset + 2,
				label: "Defenders of the week",
				rankKey: "rankDefTop",
			},
			{
				idx: offset + 1,
				label: "PvE of the week",
				rankKey: "rankPve",
				valKey: "valPve",
			},
			{
				idx: offset + 3,
				label: "Robbers of the week",
				rankKey: "rankRob",
				valKey: "valRob",
			},
		];
		for (const { idx, label, rankKey, valKey } of slots) {
			const d = extractRow(tables[idx], label);
			if (d) {
				res[rankKey] = d.rank;
				if (valKey) res[valKey] = d.val;
				res.foundTop10 = true;
			}
		}
	}

	return res;
}

/**
 * Fetch the /statistics/player/top10 page and extract weekly rankings.
 * Returns early with an empty array when DOMParser is unavailable.
 *
 * @param {string} serverOrigin - e.g. "https://ts1.travian.com"
 * @returns {Promise<Object>} { top10: [...], rankPvp, rankPve, … }
 */
async function fetchTop10(serverOrigin) {
	const result = { top10: [] };
	if (typeof DOMParser === "undefined") return result;

	try {
		const res = await fetch(`${serverOrigin}/statistics/player/top10`, {
			credentials: "include",
		});
		if (!res.ok) return result;

		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");
		const tables = doc.querySelectorAll("table");

		const extract = (table, label) => {
			if (!table) return null;
			const own = table.querySelector("tr.own") || table.querySelector("tr.hl");
			if (!own) return null;
			const r = cleanSmartNum(own.querySelector(".ra")?.innerText);
			const v = cleanSmartNum(
				own.querySelector(".val.lc")?.innerText ||
					own.querySelector(".val")?.innerText,
			);
			if (r) {
				result.top10.push({ label, rank: r, val: v });
				return { rank: r, val: v };
			}
			return null;
		};

		const offset = tables.length === 4 ? 0 : 1;
		const slots = [
			{ idx: offset, label: "PvP of the week", rankKey: "rankPvp" },
			{
				idx: offset + 2,
				label: "Defenders of the week",
				rankKey: "rankDefTop",
			},
			{
				idx: offset + 1,
				label: "PvE of the week",
				rankKey: "rankPve",
				valKey: "valPve",
			},
			{
				idx: offset + 3,
				label: "Robbers of the week",
				rankKey: "rankRob",
				valKey: "valRob",
			},
		];
		for (const { idx, label, rankKey, valKey } of slots) {
			const d = extract(tables[idx], label);
			if (d) {
				result[rankKey] = d.rank;
				if (valKey) result[valKey] = d.val;
			}
		}
	} catch {}

	return result;
}

/**
 * Parse a Travian message-list date label into a ms timestamp.
 * Handles "today, 17:09", "yesterday, 17:09" and "dd.mm.yy(yy), 17:09".
 *
 * @param {string} text - The td.dat cell text.
 * @returns {number|null}
 */
function parseTravianDate(text) {
	if (!text) return null;
	const timeM = text.match(/(\d{1,2}):(\d{2})/);
	if (!timeM) return null;
	const h = parseInt(timeM[1], 10);
	const min = parseInt(timeM[2], 10);

	const lower = text.toLowerCase();
	const d = new Date();
	d.setHours(h, min, 0, 0);
	if (lower.includes("today")) return d.getTime();
	if (lower.includes("yesterday")) {
		d.setDate(d.getDate() - 1);
		return d.getTime();
	}

	const dateM = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
	if (!dateM) return null;
	const dd = parseInt(dateM[1], 10);
	const mm = parseInt(dateM[2], 10);
	let yy = parseInt(dateM[3], 10);
	if (yy < 100) yy += 2000;
	return new Date(yy, mm - 1, dd, h, min, 0, 0).getTime();
}

/**
 * Playtime anchor: the received-time of the first system message in the inbox
 * ("TG Support" / "Travian") — i.e. when the account started on this server.
 * Fetched at most once per server; the result is stored in `gameStart_{origin}`
 * and returned from storage on subsequent calls. Returns null when the inbox
 * can't be fetched/parsed (logged out, no DOMParser, message deleted).
 *
 * @param {string} serverOrigin - e.g. "https://ts1.travian.com"
 * @param {Object} api          - `browser` or `chrome` API namespace.
 * @returns {Promise<number|null>} ms timestamp or null.
 */
async function fetchGameStart(serverOrigin, api) {
	const key = `gameStart_${serverOrigin}`;
	const stored = await api.storage.local.get([key]);
	if (stored[key] != null) return stored[key];
	if (typeof DOMParser === "undefined") return null;

	try {
		const loadPage = async (page) => {
			const url = `${serverOrigin}/messages/inbox${page > 1 ? `?page=${page}` : ""}`;
			const res = await fetch(url, { credentials: "include" });
			if (!res.ok) return null;
			const text = await res.text();
			if (text.includes('name="login"')) return null;
			return new DOMParser().parseFromString(text, "text/html");
		};

		let doc = await loadPage(1);
		if (!doc) return null;

		// Oldest messages sit on the LAST inbox page.
		let lastPage = 1;
		for (const a of doc.querySelectorAll('a[href*="/messages/inbox"]')) {
			const m = (a.getAttribute("href") || "").match(/[?&]page=(\d+)/);
			if (m) lastPage = Math.max(lastPage, parseInt(m[1], 10));
		}
		if (lastPage > 1) {
			// Human-like pause before "clicking" through to the last page
			await new Promise((r) => setTimeout(r, 400 + Math.random() * 700));
			doc = (await loadPage(lastPage)) || doc;
		}

		// Oldest system message = last support row (fallback: match sender name).
		const rows = Array.from(doc.querySelectorAll("table.index tr.support"));
		let row = rows[rows.length - 1];
		if (!row) {
			row = Array.from(doc.querySelectorAll("table.index tr"))
				.reverse()
				.find((tr) =>
					/travian|tg support/i.test(
						tr.querySelector("td.send")?.textContent || "",
					),
				);
		}

		const ts = parseTravianDate(
			row?.querySelector("td.dat")?.textContent?.trim(),
		);
		if (ts != null) await api.storage.local.set({ [key]: ts });
		return ts;
	} catch {
		return null;
	}
}

/* ═══════════════════════════════════════════════════════════════════════════
   §3  PERSISTENCE
   ═══════════════════════════════════════════════════════════════════════ */

/** Minimum milliseconds between two distinct history entries. */
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
/** Hard cap on the number of data-points stored per server. */
const MAX_HISTORY_LEN = 2000;

/**
 * Persist a server's history and drop its cached raid-income summary, which
 * raid-income-bridge.js rebuilds on the next Travian page load.
 */
async function storeHistory(api, storageKey, hist) {
	await api.storage.local.set({ [storageKey]: hist });
	await api.storage.local.remove(storageKey.replace(/^history_/, "raidIncome_"));
}

/**
 * Append (or update) a snapshot in the history array.
 * If the latest entry is within `DEDUP_WINDOW_MS`, it is overwritten instead
 * of creating a new entry (prevents rapid-click duplicates).
 *
 * @param {Object}  current    - The snapshot to save.
 * @param {Object}  api        - `browser` or `chrome` API namespace.
 * @param {string}  storageKey - e.g. "history_https://ts1.travian.com"
 * @returns {Promise<Array>} Updated history array.
 */
async function saveToHistory(current, api, storageKey) {
	if (!storageKey) return [];

	// Derive the never-trimmed playtime anchor key from `history_{origin}`,
	// and read it alongside the history in a single storage round-trip.
	const firstSeenKey = `firstSeen_${storageKey.slice("history_".length)}`;
	const res = await api.storage.local.get([storageKey, firstSeenKey]);
	const hist = res[storageKey] || [];

	const lastTs = hist.length > 0 ? hist[hist.length - 1].timestamp : 0;
	const last = hist[hist.length - 1];
	// Keep the last observation of the old period, even within the dedup window.
	const decreased = (before, after) =>
		Number.isFinite(before) && Number.isFinite(after) && after < before;
	const hasReset = (before, after) => ["valRob", "valPve", "valBounty"].some((key) =>
		decreased(before?.[key], after[key]),
	) || (after.top10 || []).some((item) =>
		decreased(top10Value(before, item.label), cleanSmartNum(item.val)),
	);
	// Also retain the first post-reset sample: replacing it with a larger value
	// could hide the drop entirely when the new counter catches up quickly.
	const counterReset = hasReset(last, current) ||
		(hist.length > 1 && hasReset(hist[hist.length - 2], last));
	if (hist.length > 0 && Date.now() - lastTs < DEDUP_WINDOW_MS && !counterReset) {
		hist[hist.length - 1] = current; // overwrite recent entry
	} else {
		hist.push(current);
	}

	// Trim oldest entries to stay within cap
	while (hist.length > MAX_HISTORY_LEN) hist.shift();

	// Playtime anchor: snapshot the start time ONCE into the never-trimmed key.
	if (res[firstSeenKey] == null) {
		// Prefer the oldest retained snapshot (backfills pre-existing users);
		// fall back to the current snapshot for a brand-new server.
		const anchor = hist.length > 0 ? hist[0].timestamp : current.timestamp;
		await api.storage.local.set({ [firstSeenKey]: anchor });
	}

	await storeHistory(api, storageKey, hist);
	return hist;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §4  MERGE LOGIC
   ═══════════════════════════════════════════════════════════════════════ */

/** Fields that should be merged with a simple "new value wins" strategy. */
const WEEKLY_KEYS = [
	"rankPvp",
	"rankPve",
	"valPve",
	"rankDefTop",
	"rankRob",
	"valRob",
];

/**
 * Merge freshly-parsed fields into an existing snapshot, preferring non-null
 * new values over stale ones.  Mutates and returns `target`.
 *
 * @param {Object} target - The accumulated snapshot.
 * @param {Object} source - New data to fold in (may have null fields).
 * @param {string[]} keys - Which keys to consider.
 * @returns {Object} `target` with updates applied.
 */
function mergeFields(target, source, keys) {
	for (const k of keys) {
		if (source[k] != null) target[k] = source[k];
	}
	return target;
}

/**
 * Central HTML → merged-snapshot pipeline.
 *
 * 1. Reads the previous latest snapshot from storage as a baseline.
 * 2. Runs extractReactData (JSON-based, always available).
 * 3. Runs parseStatsRobust (DOM-based, degrades in service-worker).
 * 4. Optionally fetches /statistics/player/top10 for weekly rankings.
 * 5. Saves to history + latest storage.
 *
 * @param {string}  html         - The /statistics/general page HTML.
 * @param {Object}  api          - `browser` or `chrome` API namespace.
 * @param {string}  serverOrigin - Server base URL.
 * @param {string}  storageKey   - History storage key.
 * @param {boolean} [returnOnly=false] - If true, skip persistence and top-10 fetch.
 * @returns {Promise<Object>} The merged snapshot.
 */
async function processHtmlData(
	html,
	api,
	serverOrigin,
	storageKey,
	returnOnly = false,
) {
	const latestKey = `latest_${serverOrigin}`;

	// Load previous state as the merge baseline
	const storageRes = await api.storage.local.get([storageKey, latestKey]);
	const history = storageRes[storageKey] || [];
	const lastData =
		storageRes[latestKey] ||
		(history.length > 0 ? history[history.length - 1] : { top10: [] });

	const merged = { ...lastData, timestamp: Date.now() };

	// Layer 1: React hydration data (no DOM needed)
	const reactFields = [
		"rankPop",
		"rankProd",
		"pointsProd",
		"rankCp",
		"cpProd",
		"rankDef",
		"rankOff",
		"pointsOff",
		"pointsDef",
		"rankProdSoFar",
		"valProdSoFar",
		"rankCpSoFar",
		"valCpSoFar",
		"valBounty",
		"totalPlayers",
	];
	const jsonData = extractReactData(html);
	if (jsonData) mergeFields(merged, jsonData, reactFields);

	// Layer 2: DOM scraping (gracefully skipped in service-worker)
	const domFields = [
		"rankPop",
		"rankProd",
		"rankCp",
		"cpProd",
		"rankDef",
		"rankOff",
		"pointsDef",
		"pointsOff",
		"valPop",
	];
	const scannedData = parseStatsRobust(html);
	// Only fill gaps — don't overwrite values already set by React data
	for (const k of domFields) {
		if (merged[k] == null && scannedData[k] != null) merged[k] = scannedData[k];
	}
	if (scannedData.valPop) merged.valPop = scannedData.valPop; // always prefer fresh pop

	if (scannedData.foundTop10) merged.top10 = scannedData.top10List;
	mergeFields(merged, scannedData, WEEKLY_KEYS);

	if (returnOnly) return merged;

	// Layer 3: Dedicated Top-10 fetch when DOM didn't find the tables
	if (!scannedData.foundTop10) {
		const top10Data = await fetchTop10(serverOrigin);
		if (top10Data.top10.length > 0) merged.top10 = top10Data.top10;
		mergeFields(merged, top10Data, WEEKLY_KEYS);
	}

	// Persist
	const newHistory = await saveToHistory(merged, api, storageKey);
	await api.storage.local.set({ [latestKey]: merged });

	if (typeof renderUI === "function") renderUI(merged, newHistory);
	return merged;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §5  FULL SERVER SCRAPE (used by background.js AND popup.js)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Perform a complete multi-endpoint data collection for a single server.
 * This consolidates the duplicated fetch logic that previously existed in
 * both background.js `fetchForServer()` and popup.js `fetchData()`.
 *
 * Steps:
 *   1. GET /statistics/general         → React + DOM extraction
 *   2. GET /statistics/player/overview → population value
 *   3. GET /village/statistics/…       → total production value
 *   4. GET /statistics/player/top10    → weekly rankings
 *
 * @param {string}  serverOrigin - e.g. "https://ts1.travian.com"
 * @param {Object}  api          - `browser` or `chrome` API namespace.
 * @param {string}  storageKey   - History storage key.
 * @param {Object}  [options]
 * @param {boolean} [options.saveToHistory=true] - Whether to persist to storage.
 * @returns {Promise<{data: Object|null, status: string}>}
 *          `status` is one of: "ok", "logged_out", "fetch_error", "empty"
 */
async function fetchAllEndpoints(serverOrigin, api, storageKey, options = {}) {
	const { saveToHistory: shouldSave = true } = options;
	const latestKey = `latest_${serverOrigin}`;
	const statusKey = `lastFetchStatus_${serverOrigin}`;

	const setStatus = async (ok, reason) => {
		await api.storage.local.set({
			[statusKey]: { timestamp: Date.now(), ok, reason },
		});
	};

	try {
		// Step 1: General statistics (primary data source)
		const genRes = await fetch(`${serverOrigin}/statistics/general`, {
			credentials: "include",
		});
		if (!genRes.ok) {
			await setStatus(false, `HTTP ${genRes.status}`);
			return { data: null, status: "fetch_error" };
		}

		const genText = await genRes.text();
		if (genText.includes('name="login"')) {
			await setStatus(false, "logged_out");
			return { data: null, status: "logged_out" };
		}

		let mergedData = await processHtmlData(
			genText,
			api,
			serverOrigin,
			storageKey,
			/* returnOnly */ true,
		);

		// Step 2: Player overview (for population value)
		try {
			const ovRes = await fetch(`${serverOrigin}/statistics/player/overview`, {
				credentials: "include",
			});
			if (ovRes.ok) {
				const ovText = await ovRes.text();
				const ovData = parseStatsRobust(ovText);
				if (ovData.valPop) mergedData.valPop = ovData.valPop;
				if (ovData.rankPop) mergedData.rankPop = ovData.rankPop;
			}
		} catch (_) {
			/* non-critical */
		}

		// Step 3: Production total
		try {
			const prodRes = await fetch(
				`${serverOrigin}/village/statistics/resources/production`,
				{ credentials: "include" },
			);
			if (prodRes.ok && typeof DOMParser !== "undefined") {
				const prodText = await prodRes.text();
				const prodDoc = new DOMParser().parseFromString(prodText, "text/html");
				const totalSpan = prodDoc.querySelector(".sum .total");
				if (totalSpan) mergedData.valProd = cleanSmartNum(totalSpan.innerText);
			}
		} catch (_) {
			/* non-critical */
		}

		// Step 4: Top 10
		const top10Data = await fetchTop10(serverOrigin);
		if (top10Data.top10.length > 0) mergedData.top10 = top10Data.top10;
		mergeFields(mergedData, top10Data, WEEKLY_KEYS);

		// Persist
		if (shouldSave) {
			await saveToHistory(mergedData, api, storageKey);
		}
		await api.storage.local.set({ [latestKey]: mergedData });
		await setStatus(true, "ok");

		return { data: mergedData, status: "ok" };
	} catch (e) {
		await setStatus(false, e.message);
		return { data: null, status: "fetch_error" };
	}
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6  PERCENTILE-BASED RANK TIERS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Percentile thresholds (from best to worst). `maxPct` is the upper bound of
 * the tier as a fraction of `totalPlayers`. Anything beyond the last entry
 * falls into Iron.
 */
const RANK_TIERS = [
	{ name: "immortal", maxPct: 0.0045, color: "#a50512" }, // top 0.45% (~83 on an 18k world)
	{ name: "ascended", maxPct: 0.009, color: "#e668a5" }, // top 0.9% (~166)
	{ name: "diamond", maxPct: 0.02, color: "hsl(250, 71%, 66%)" }, // top 2%
	{ name: "emerald", maxPct: 0.03, color: "#13b958" }, // top 3%
	{ name: "platinum", maxPct: 0.06, color: "#7ac3e0" }, // top 6%
	{ name: "gold", maxPct: 0.14, color: "#ffb020" }, // top 14%
	{ name: "silver", maxPct: 0.20, color: "#acacac" }, // top 20%
	{ name: "bronze", maxPct: 0.30, color: "#cd7f32" }, // top 30%
	{ name: "iron", maxPct: 1.0, color: "#ffffff" }, // bottom 70%
];

/**
 * Compute the rank tier for a given absolute rank and total player pool.
 *
 * Special cases:
 *   - rank <= 10  → isTop10=true (shimmer effect applied in UI)
 *   - immortal    → isImmortal=true (red aura applied in UI)
 *   - rank null / totalPlayers null → returns a neutral fallback
 *
 * @param {number} rank
 * @param {number} totalPlayers
 * @returns {{color: string, tier: string, isTop10: boolean, isImmortal: boolean}}
 */
function getRankTier(rank, totalPlayers) {
	if (rank == null || !totalPlayers || totalPlayers <= 0) {
		return { color: "#dddddd", tier: "unknown", isTop10: false, isImmortal: false };
	}

	const isTop10 = rank <= 10;
	const pct = rank / totalPlayers;

	for (const tier of RANK_TIERS) {
		if (pct <= tier.maxPct) {
			return {
				color: tier.color,
				tier: tier.name,
				isTop10,
				isImmortal: tier.name === "immortal",
			};
		}
	}

	return { color: "#ffffff", tier: "iron", isTop10, isImmortal: false };
}
