/**
 * TRAVIAN WATCHMAN PRO - REMOTE FETCHERS
 */

// ==========================================
// VILLAGE LOCK — serializes restore across all newdid= fetchers.
// Travian treats any authenticated request containing `newdid=VID` as a
// server-side village switch (last one wins). Without coordination, periodic
// background fetches silently move the user's active village — next real
// navigation lands in the wrong village (usually sidebar #1).
// INVARIANT: every newdid= fetch site in this file MUST be wrapped in
// withVillageLock(). Never remove.
// ==========================================
let _villageLockHolders = 0;
let _villageLockOrigDid = null;
// Village the user deliberately switched to while a lock was open. It
// overrides the restore target: restoring the pre-burst village would undo the
// user's own switch, and their next click would land back in the old village.
let _userSwitchDid = null;
// In-tab fallback serializer when the Web Locks API is unavailable.
let _villageLockChain = Promise.resolve();
// True while the final restore fetch is in flight (after holders hit 0 but
// before the server has acknowledged the restore). Refreshes during this
// window must still fire the pagehide beacon — otherwise the server's active
// village stays on the last `newdid=` we sent (the attacked village), and the
// page reload lands there. See pagehide handler below.
let _villageLockRestoreInFlight = false;
let _villageLockRestoreDid = null;
// Last restore this tab completed ({ did, at }). A user switch announced by
// another tab right after it means our restore may have overtaken the user's
// own switch request — see the BroadcastChannel handler.
let _lastRestore = null;
// Sticky last-known-good DID. Updated whenever a valid DID is observed from
// any source; survives transient DOM re-renders where `.active` is momentarily
// absent. Read as the last-resort fallback so capture never returns null when
// we've ever seen a valid DID this session.
let _lastKnownActiveDid = null;

// Reads the active village DID from a sidebar. `root` defaults to the live
// document but may be a parsed DOM (e.g. a fetched dorf1 response) so the
// restore can confirm the server actually switched back.
function _readDidFromSidebar(root = document) {
	// Travian removed `newdid=` from sidebar hrefs (now `<a href="#">`); the vid
	// is on `data-did` of the active entry. That is authoritative, so check it
	// before the legacy href layout. A page-wide `a.active[href*=newdid]` match
	// is not used: unrelated active links can carry another village's id.
	const activeEntry = root.querySelector(
		".villageList .listEntry.active[data-did], #sidebarBoxVillageList .listEntry.active[data-did]",
	);
	const entryDid = activeEntry?.getAttribute("data-did");
	if (entryDid && /^\d+$/.test(entryDid)) return entryDid;
	const el = root.querySelector(
		".villageList .listEntry.active a[href*='newdid=']",
	);
	return el?.getAttribute("href")?.match(/newdid=(\d+)/)?.[1] || null;
}

function _readDidFromUrl() {
	// Travian often includes newdid in the current URL after a click.
	const m = window.location.search.match(/[?&]newdid=(\d+)/);
	if (m) return m[1];
	// Some pages expose Travian.Resources or window villageId globals.
	try {
		if (typeof window.villageId === "string" && /^\d+$/.test(window.villageId))
			return window.villageId;
	} catch {
		/* silenced */
	}
	return null;
}

function _readDidFromVillageName() {
	if (typeof getActiveVillageName !== "function") return null;
	const name = getActiveVillageName();
	if (!name || name === "Village") return null;
	if (typeof globalVillageMap !== "object" || !globalVillageMap) return null;
	for (const [vid, n] of Object.entries(globalVillageMap)) {
		if (n === name) return vid;
	}
	return null;
}

function _captureActiveVillageDid() {
	// Priority order: sidebar DOM (most authoritative) → URL → name lookup →
	// sticky last-known-good memo. The memo ensures we never return null when
	// a valid DID has ever been observed this session.
	const fromSidebar = _readDidFromSidebar();
	const fromUrl = _readDidFromUrl();
	const fromName = _readDidFromVillageName();
	// [DEBUG vlock] temporary: shows which source wins and whether it matches
	// the village you're actually on. Remove once the v2→v1 switch is fixed.
	console.warn("[travAlarm:vlock] capture", {
		fromSidebar,
		fromUrl,
		fromName,
		lastKnown: _lastKnownActiveDid,
		activeName:
			typeof getActiveVillageName === "function"
				? getActiveVillageName()
				: null,
		result: fromSidebar || fromUrl || fromName || _lastKnownActiveDid,
	});
	if (fromSidebar) {
		_lastKnownActiveDid = fromSidebar;
		return fromSidebar;
	}
	if (fromUrl) {
		_lastKnownActiveDid = fromUrl;
		return fromUrl;
	}
	if (fromName) {
		_lastKnownActiveDid = fromName;
		return fromName;
	}
	return _lastKnownActiveDid;
}

// Passive memo updater — observes the sidebar on every DOM change so
// _lastKnownActiveDid is always fresh by the time a lock opens.
if (typeof document !== "undefined" && document.body) {
	const _memoObserver = new MutationObserver(() => {
		const did = _readDidFromSidebar() || _readDidFromUrl();
		if (did) _lastKnownActiveDid = did;
	});
	try {
		_memoObserver.observe(document.body, { childList: true, subtree: true });
	} catch {
		/* silenced */
	}
	// Prime immediately at load
	const primed = _readDidFromSidebar() || _readDidFromUrl();
	if (primed) _lastKnownActiveDid = primed;
}

async function _doRestoreActiveVillage(did) {
	if (!did) return;
	// [DEBUG vlock] temporary — this is the request that physically switches the
	// server's active village. If `did` here is v1 while you're on v2, capture is wrong.
	console.warn("[travAlarm:vlock] RESTORE writing newdid=", did);
	// A single fire-and-forget restore can lose the race against the just-sent
	// `newdid=` fetches (HTTP/2 reordering, server-side write lag) — the active
	// village is then silently left on the wrong one and the next refresh lands
	// there. Re-issue until the server confirms `did` is active, bounded to a few
	// attempts. Each request targets the correct village, so retries can only
	// push the server toward the right state — never away from it.
	for (let attempt = 0; attempt < 3; attempt++) {
		// A switch broadcast from another tab mid-restore retargets the retry.
		did = _userSwitchDid || did;
		try {
			await fetch(`/dorf1.php?newdid=${did}`, { credentials: "include" });
		} catch {
			// Network error; next user navigation will correct the active village.
			return;
		}
		const active = await _fetchServerActiveDid();
		// Confirmed, or unverifiable (don't loop blindly).
		if (!active || active === did) {
			_lastRestore = { did, at: Date.now() };
			return;
		}
	}
}

// The server's active village right now. The game's own GraphQL query answers
// that directly without switching anything (the village list is rendered by
// React, so a fetched page's markup is only the fallback). This page's sidebar
// can be stale: another Travian tab may have switched village since it loaded,
// and restoring the stale village would move that tab's user back.
async function _fetchServerActiveDid() {
	try {
		const res = await fetch("/api/v1/graphql", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json; charset=UTF-8" },
			body: JSON.stringify({ query: "query{ownPlayer{village{id}}}" }),
		});
		const id = res.ok ? (await res.json())?.data?.ownPlayer?.village?.id : null;
		if (id != null && /^\d+$/.test(String(id))) return String(id);
	} catch {
		/* fall back to the dorf1 sidebar */
	}
	try {
		const res = await fetch("/dorf1.php", { credentials: "include" });
		if (!res.ok) return null;
		const html = await res.text();
		return _readDidFromSidebar(new DOMParser().parseFromString(html, "text/html"));
	} catch {
		return null;
	}
}

// Puts the server back on `did` unless it is already there. Holds the same
// cross-tab lock as the fetch bursts so it never interleaves with one.
function _reassertVillage(did) {
	const run = async () => {
		const active = await _fetchServerActiveDid();
		if (active && active !== did) await _doRestoreActiveVillage(did);
	};
	return navigator.locks?.request ? navigator.locks.request("_twVillageLock", run) : run();
}

async function _runWithVillageLock(asyncFn) {
	// A switch seen during an earlier burst is already reflected server-side.
	_userSwitchDid = null;
	const origDid = (await _fetchServerActiveDid()) || _captureActiveVillageDid();
	// [DEBUG vlock] temporary
	console.warn(
		"[travAlarm:vlock] lock OPEN origDid=",
		origDid || "(null → REFUSE burst)",
	);
	// If we cannot determine the active village, REFUSE to run the fetch
	// burst. Allowing it to proceed without a restore target is what causes
	// the session to drift to whichever village was fetched last (typically
	// sidebar #1). Skipping one cycle is always safer than a silent switch.
	if (!origDid) return undefined;
	_villageLockOrigDid = origDid;
	_villageLockHolders++;
	try {
		return await asyncFn();
	} finally {
		_villageLockHolders--;
		_villageLockOrigDid = null;
		const did = _userSwitchDid || origDid;
		// Restore IMMEDIATELY — a debounce leaves a window where a user refresh
		// lands them on the rally-point village (the last newdid= we sent).
		//
		// Track the restore separately so pagehide can still fire the beacon
		// if the user hits F5 between holders→0 and the server ack'ing the
		// restore. Without this, refreshing while a rally fetch is finishing
		// lands the user on the attacked village.
		_villageLockRestoreInFlight = true;
		_villageLockRestoreDid = did;
		try {
			await _doRestoreActiveVillage(did);
		} finally {
			_villageLockRestoreInFlight = false;
			_villageLockRestoreDid = null;
		}
	}
}

/**
 * Runs asyncFn between capturing the server's active village and restoring it.
 * Bursts are exclusive across every Travian tab of this origin (Web Locks):
 * overlapping bursts would each capture a village the other had just switched
 * to and "restore" it. Callers must not nest withVillageLock calls.
 * @param {() => Promise<any>} asyncFn
 */
function withVillageLock(asyncFn) {
	const run = () => _runWithVillageLock(asyncFn);
	if (navigator.locks?.request)
		return navigator.locks.request("_twVillageLock", run);
	const result = _villageLockChain.then(run, run);
	_villageLockChain = result.catch(() => {});
	return result;
}

// ==========================================
// USER VILLAGE SWITCHES
// A deliberate switch during a burst must win over the restore. Sidebar entries
// are `<a href="#">` (the id is only on data-did). Restrict detection to those
// controls because ordinary menu links can also carry `newdid=` for context.
// ==========================================
const _villageChannel =
	typeof BroadcastChannel === "function"
		? new BroadcastChannel("_twVillageSwitch")
		: null;

function _noteUserSwitch(did) {
	if (!did || !/^\d+$/.test(String(did))) return;
	_userSwitchDid = String(did);
	_lastKnownActiveDid = String(did);
	try {
		_villageChannel?.postMessage({ did: String(did) });
	} catch {
		/* silenced */
	}
}

if (typeof window !== "undefined") {
	// A switch in another tab also overrides this tab's restore target.
	if (_villageChannel)
		_villageChannel.onmessage = (event) => {
			const did = String(event.data?.did || "");
			if (!/^\d+$/.test(did)) return;
			_userSwitchDid = did;
			// Our restore finished moments before we heard about this switch, so
			// it may have reached the server after the user's switch request and
			// undone it. Once their page has loaded, make sure they stayed put.
			const recent = _lastRestore;
			if (recent && recent.did !== did && Date.now() - recent.at < 10000) {
				_lastRestore = null;
				setTimeout(() => _reassertVillage(did).catch(() => {}), 2000);
			}
		};
	document.addEventListener(
		"click",
		(event) => {
			const link = event.target?.closest?.("a");
			if (!link) return;
			const entry = link.closest(".villageList .listEntry[data-did]");
			if (!entry) return;
			_noteUserSwitch(
				entry.getAttribute("data-did") ||
					(link.getAttribute("href") || "").match(/[?&]newdid=(\d+)/)?.[1],
			);
		},
		true,
	);
}

// Safety net: if the page is being unloaded (refresh, navigation, tab close)
// while a village-switching fetch is in flight or just completed, fire a
// synchronous beacon so the server's active village is restored before the
// next page load reads it.
if (typeof window !== "undefined") {
	window.addEventListener("pagehide", () => {
		// A village the user just switched to wins: this unload is that switch,
		// and beaconing the pre-burst village would silently move them back.
		// Otherwise prefer the in-flight restore target, then the active orig
		// DID, then the sticky last-known DID — covers all three race windows:
		//   1. fetch in flight (holders > 0)
		//   2. final restore fetch in flight (holders == 0, but server hasn't
		//      yet processed the restore — without this branch, refresh lands
		//      on the last `newdid=` we sent, e.g. the attacked village)
		//   3. neither, but we have a last-known good DID
		const did =
			_userSwitchDid ||
			_villageLockRestoreDid ||
			_villageLockOrigDid ||
			_lastKnownActiveDid;
		const inFlight = _villageLockHolders > 0 || _villageLockRestoreInFlight;
		if (inFlight && did) {
			// [DEBUG vlock] temporary — beacon fired on refresh/unload.
			console.warn("[travAlarm:vlock] pagehide BEACON newdid=", did, {
				userSwitch: _userSwitchDid,
				restoreDid: _villageLockRestoreDid,
				origDid: _villageLockOrigDid,
				lastKnown: _lastKnownActiveDid,
				holders: _villageLockHolders,
			});
			// Persist the expected village so the next page load can detect a
			// wrong landing (the reload's GET racing past this beacon) and
			// self-heal — see the startup block below.
			try {
				sessionStorage.setItem(
					"_twVlockPending",
					JSON.stringify({ did, ts: Date.now() }),
				);
			} catch {
				/* unload — nothing we can do */
			}
			try {
				navigator.sendBeacon(`/dorf1.php?newdid=${did}`);
			} catch {
				/* unload — nothing we can do */
			}
		}
	});
}

// Records village ids our own newdid= fetches have targeted this tab session,
// so the self-heal below can tell "our fetch race dumped the user here" apart
// from a deliberate village switch.
function _noteNewdidTarget(vid) {
	if (!vid) return;
	try {
		const raw = JSON.parse(sessionStorage.getItem("_twVlockTargets") || "null");
		const vids = raw && Array.isArray(raw.vids) ? raw.vids : [];
		if (!vids.includes(String(vid))) vids.push(String(vid));
		sessionStorage.setItem(
			"_twVlockTargets",
			JSON.stringify({ vids, ts: Date.now() }),
		);
	} catch {
		/* silenced */
	}
}

// Self-heal wrong landings: if the previous page unloaded while a newdid=
// fetch/restore was in flight, the reload's GET can race past the pagehide
// beacon and land the user on the last village we fetched (the attacked one).
// Detect that here — expected DID persisted at pagehide vs the village the
// server actually rendered — and reload once onto the right village. Only
// fires when the landed village is one OUR fetches targeted, so a deliberate
// sidebar switch is never bounced.
(() => {
	if (typeof window === "undefined") return;
	let marker = null;
	try {
		marker = JSON.parse(sessionStorage.getItem("_twVlockPending") || "null");
		sessionStorage.removeItem("_twVlockPending");
	} catch {
		/* silenced */
	}
	if (!marker || !marker.did) return;
	if (Date.now() - (marker.ts || 0) > 30000) return;
	// URL already carries newdid= → deliberate switch; leave it alone.
	if (/[?&]newdid=\d+/.test(window.location.search)) return;
	let targets = null;
	try {
		targets = JSON.parse(sessionStorage.getItem("_twVlockTargets") || "null");
	} catch {
		/* silenced */
	}
	if (!targets || !Array.isArray(targets.vids)) return;
	const expected = String(marker.did);

	// The interrupted burst's own newdid= request may still be processed after
	// this page loaded — the unload beacon can overtake it — leaving the server
	// on the fetched village so the NEXT refresh lands there. Check again once
	// it has settled, unless the user has switched village since.
	setTimeout(() => {
		if (_userSwitchDid && _userSwitchDid !== expected) return;
		const run = async () => {
			const active = await _fetchServerActiveDid();
			if (active && active !== expected && targets.vids.includes(active)) {
				console.warn("[travAlarm:vlock] late drift to", active, "→ restoring", expected);
				await _doRestoreActiveVillage(expected);
			}
		};
		(navigator.locks?.request ? navigator.locks.request("_twVillageLock", run) : run()).catch(() => {});
	}, 4000);

	const active = _readDidFromSidebar();
	if (!active || active === expected) return;
	if (!targets.vids.includes(String(active))) return;
	console.warn(
		"[travAlarm:vlock] self-heal: landed on",
		active,
		"expected",
		marker.did,
	);
	// Keep the marker so the reloaded page runs the late-drift check too.
	try {
		sessionStorage.setItem("_twVlockPending", JSON.stringify(marker));
	} catch {
		/* silenced */
	}
	const url = new URL(window.location.href);
	url.searchParams.set("newdid", expected);
	window.location.replace(url.toString());
})();

/**
 * Returns true if the named fetcher is allowed to run (not already running and past cooldown).
 * Sets isFetching=true and records lastTime when it returns true.
 * @param {string} key - key in fetchState ("prod"|"training"|"warehouse"|"celebrations")
 * @param {number} cooldownMs
 */
function canFetch(key, cooldownMs) {
	const f = fetchState[key];
	if (f.isFetching || Date.now() - f.lastTime < cooldownMs) return false;
	f.isFetching = true;
	f.lastTime = Date.now();
	return true;
}

/**
 * Reads a fill-time delay (ms) from a table cell.
 * Checks for a .timer span with a `value` attribute first, then parses text.
 * Returns 0 if no valid time found.
 * @param {Element} cell
 * @returns {number}
 */
function parseCellDelay(cell) {
	if (!cell) return 0;
	const timerSpan = cell.querySelector(".timer");
	if (timerSpan) {
		const val = (timerSpan.getAttribute("value") | 0) * 1000;
		if (val > 0) return val;
		// value=0 means server didn't populate it — fall through to text parse
		const timerTxt = timerSpan.textContent.trim();
		if (/\d+:\d+:\d+/.test(timerTxt)) return parseSmartDuration(timerTxt);
	}
	const txt = cell.textContent.trim();
	if (/\d+:\d+:\d+/.test(txt)) return parseSmartDuration(txt);
	return 0;
}

// ==========================================
// BACKGROUND PRODUCTION FETCHER
// ==========================================
async function fetchProductionData() {
	if (!canFetch("prod", 10000)) return;

	try {
		const res = await fetch("/village/statistics/resources/production");
		const text = await res.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");

		const rows = doc.querySelectorAll("tbody tr");
		rows.forEach((row) => {
			if (row.classList.contains("sum") || row.querySelector(".empty")) return;
			const vilNode = row.querySelector(".vil a");
			if (!vilNode) return;

			const vName = cleanText(vilNode.innerText);

			const getVal = (selector) => {
				const el = row.querySelector(selector);
				if (!el) return 0;
				return parseInt(el.innerText.replace(/[^\d-]/g, ""), 10) || 0;
			};

			const pW = getVal(".lum");
			const pC = getVal(".clay");
			const pI = getVal(".iron");
			const pCr = getVal(".crop");
			const total = pW + pC + pI + pCr;

			const prodMap = { w: pW, c: pC, i: pI, cr: pCr };
			localStorage.setItem(`_wpt_${serverTag}_${vName}`, total);
			localStorage.setItem(
				`_wpm_${serverTag}_${vName}`,
				JSON.stringify(prodMap),
			);
		});

		scan(); // Re-trigger scan to update NPC text
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.prod.isFetching = false;
	}
}

// ==========================================
// TRAINING QUEUE FETCHER
// ==========================================
async function fetchTrainingData() {
	if (!canFetch("training", 30000)) return;

	const GID_NAMES = {
		19: "Barracks",
		20: "Stable",
		21: "Workshop",
		22: "Academy",
		29: "Great Barracks",
		30: "Great Stable",
		36: "Trapper",
		45: "Hospital",
		46: "Hospital",
	};

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/troops/training",
		);
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const table = doc.querySelector("table.under_progress");
		if (!table) return;

		// Parse header columns to get building GIDs
		const headerCells = table.querySelectorAll("thead th");
		const columns = [];
		headerCells.forEach((th, i) => {
			const icon = th.querySelector('i[class*="type"]');
			if (icon) {
				const match = icon.className.match(/type(\d+)/);
				if (match) columns.push({ colIdx: i, gid: match[1] });
			}
		});

		// Parse each village row
		const queueMap = {};
		table.querySelectorAll("tbody tr").forEach((row) => {
			const vilNode = row.querySelector(".villageName a");
			if (!vilNode) return;
			const vName = cleanText(vilNode.textContent);
			if (!vName) return;

			const cells = row.querySelectorAll("td");
			columns.forEach(({ colIdx, gid }) => {
				const cell = cells[colIdx];
				if (!cell) return;
				const durationSpan = cell.querySelector(".duration");
				if (!durationSpan) return;
				const seconds =
					(parseSmartDuration(durationSpan.textContent.trim()) ?? 0) / 1000;
				if (seconds <= 0) return;

				const buildingName = GID_NAMES[gid] || `Building ${gid}`;
				const key = `${buildingName}__${vName}`;
				if (!queueMap[key] || seconds > queueMap[key].seconds) {
					queueMap[key] = { buildingName, vName, seconds };
				}
			});
		});

		const newAlarms = [];
		const activeNames = [];

		Object.values(queueMap).forEach(({ buildingName, vName, seconds }) => {
			const alarmName = `🎓 ${buildingName} (${vName}) ${serverTag}`;
			activeNames.push(alarmName);
			newAlarms.push({
				name: alarmName,
				delay: seconds * 1000,
				customType: "training",
			});
		});

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});

			// Only clean up stale training alarms when we have a valid non-empty
			// snapshot — sending an empty activeNames would wipe all training alarms.
			api.runtime.sendMessage({
				type: "CLEAR_STALE_TRAINING",
				activeNames,
				serverTag,
			});
		}
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.training.isFetching = false;
	}
}

// ==========================================
// WAREHOUSE / GRANARY FETCHER (Storage Alarms)
// ==========================================
const STORAGE_THRESHOLD = 3600000; // 1h in ms
const GRANARY_BURST_MS = 600000; // 10 min between starving-village switch bursts

/**
 * Fetches dorf1 for a given village and returns the "granary empty in" delay
 * in ms, read from the stockBar crop tooltip's timer. Returns 0 if not found.
 * @param {string} vDid
 * @returns {Promise<number>}
 */
async function fetchGranaryEmptyDelay(vDid) {
	try {
		_noteNewdidTarget(vDid);
		const res = await fetch(`/dorf1.php?newdid=${vDid}`, {
			credentials: "include",
		});
		const html = await res.text();
		const doc = new DOMParser().parseFromString(html, "text/html");
		const sb = doc.getElementById("stockBar");
		if (!sb) return 0;
		const titles = Array.from(sb.querySelectorAll("[title]"))
			.map((el) => el.getAttribute("title"))
			.filter(Boolean);
		const cropTip = titles.find((t) => t.includes("Empty in")) || "";
		if (!cropTip) return 0;
		const inner = new DOMParser().parseFromString(cropTip, "text/html");
		const timer = inner.querySelector("span.timer, span[id^='timer']");
		if (!timer) return 0;
		const secs = parseInt(timer.getAttribute("value"), 10) || 0;
		return secs > 0 ? secs * 1000 : 0;
	} catch {
		return 0;
	}
}

async function fetchWarehouseData() {
	if (!canFetch("warehouse", 60000)) return;

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/resources/warehouse",
		);
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const warehouseTable = doc.getElementById("warehouse");
		const newAlarms = [];
		const activeNames = [];

		if (warehouseTable) {
			const rows = warehouseTable.querySelectorAll("tbody tr");
			const starvingRows = [];
			rows.forEach((row) => {
				const cells = row.querySelectorAll("td");
				if (cells.length < 7) return;

				let vName = "Village";
				let vDid = null;
				const vilCell = row.querySelector(".vil") || cells[0];
				if (vilCell) {
					const aNode = vilCell.querySelector("a");
					vName = cleanText(aNode ? aNode.textContent : vilCell.textContent);
					const href = aNode?.getAttribute("href") || "";
					const m = href.match(/newdid=(\d+)/);
					if (m) vDid = m[1];
				}

				// Warehouse timer (column 5, index 4)
				const whCell = cells[4];
				if (whCell) {
					const whTxt = whCell.textContent.trim();
					const whAlreadyFull = whTxt === "-" || whTxt === "–";
					const delay = whAlreadyFull ? 0 : parseCellDelay(whCell);
					if ((whAlreadyFull || delay > 0) && delay < STORAGE_THRESHOLD) {
						const alarmName = `📦 Warehouse Full | ${vName} ${serverTag}`;
						activeNames.push(alarmName);
						newAlarms.push({ name: alarmName, delay, customType: "storage" });
					}
				}

				// Granary timer (column 7, index 6)
				// A cell text starting with "−" (U+2212) means crop production is
				// negative — the timer counts down to EMPTY, not FULL, and the
				// warehouse-stats value is unreliable. For those cases fetch dorf1
				// and read the stockBar crop tooltip's "Empty in" timer directly.
				const grCell = cells[6];
				if (grCell) {
					const grTxt = grCell.textContent.trim();
					const grAlreadyFull = grTxt === "-" || grTxt === "–";
					const grStarving =
						!grAlreadyFull && (grTxt.startsWith("−") || grTxt.startsWith("-"));
					if (grStarving) {
						if (vDid) starvingRows.push({ vName, vDid });
					} else {
						const delay = grAlreadyFull ? 0 : parseCellDelay(grCell);
						// A plain dash means the granary isn't filling — which happens
						// both when it's genuinely full (crop produced but capped) AND
						// when net crop production is 0 (stable below cap). Only the
						// former should fire a done "Granary Full" alarm; gate on the
						// cached net crop production so a 0-production village doesn't
						// spawn a bogus already-done alarm.
						let grCropProd = null;
						try {
							const pm = JSON.parse(
								localStorage.getItem(`_wpm_${serverTag}_${vName}`) || "null",
							);
							if (pm) grCropProd = pm.cr;
						} catch {}
						const grFull = grAlreadyFull && grCropProd > 0;
						if ((grFull || delay > 0) && delay < STORAGE_THRESHOLD) {
							const alarmName = `📦 Granary Full | ${vName} ${serverTag}`;
							activeNames.push(alarmName);
							newAlarms.push({
								name: alarmName,
								delay,
								customType: "storage",
							});
						}
					}
				}
			});

			// Reading a starving village's "empty in" timer needs a newdid=
			// switch, so: at most once per GRANARY_BURST_MS across all tabs, the
			// jitter is spent before switching, and the villages are fetched in
			// parallel so the server is off the user's village for one round trip.
			const granaryTsKey = `_twGranaryTs_${serverTag}`;
			const lastGranary = parseInt(localStorage.getItem(granaryTsKey), 10) || 0;
			if (starvingRows.length > 0 && Date.now() - lastGranary < GRANARY_BURST_MS) {
				// Not re-measured this time — keep the existing alarms alive.
				for (const { vName } of starvingRows)
					activeNames.push(`🌾 Granary Empty | ${vName} ${serverTag}`);
			} else if (starvingRows.length > 0) {
				try {
					localStorage.setItem(granaryTsKey, String(Date.now()));
				} catch {
					/* silenced */
				}
				await new Promise((r) => setTimeout(r, jitterMs(1500)));
				await withVillageLock(async () => {
					const delays = await Promise.all(
						starvingRows.map(({ vDid }) => fetchGranaryEmptyDelay(vDid)),
					);
					starvingRows.forEach(({ vName }, i) => {
						if (!(delays[i] > 0 && delays[i] < STORAGE_THRESHOLD)) return;
						const alarmName = `🌾 Granary Empty | ${vName} ${serverTag}`;
						activeNames.push(alarmName);
						newAlarms.push({ name: alarmName, delay: delays[i], customType: "storage" });
					});
				});
			}
		} else {
			// Fallback: older layout
			const table =
				doc.getElementById("overview") ||
				doc.getElementById("resources") ||
				doc.querySelector("#content table");
			if (!table) {
				fetchState.warehouse.isFetching = false;
				return;
			}

			const rows = table.querySelectorAll("tbody tr");
			rows.forEach((row) => {
				const cells = row.querySelectorAll("td");
				const vilCell = row.querySelector(".vil") || cells[0];
				if (!vilCell) return;
				const aNode = vilCell.querySelector("a");
				const vName = cleanText(
					aNode ? aNode.textContent : vilCell.textContent,
				);

				cells.forEach((cell, idx) => {
					if (idx === 0) return;
					const txt = cell.textContent.trim();
					const alreadyFull = txt === "-" || txt === "–";
					const delay = alreadyFull ? 0 : parseCellDelay(cell);
					if ((!alreadyFull && delay <= 0) || delay >= STORAGE_THRESHOLD)
						return;
					const alarmName = `📦 Warehouse Full | ${vName} ${serverTag}`;
					if (!activeNames.includes(alarmName)) {
						activeNames.push(alarmName);
						newAlarms.push({ name: alarmName, delay, customType: "storage" });
					}
				});
			});
		}

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});
		}

		// Always send cleanup after a successful fetch — empty activeNames is
		// authoritative: it means no storage is near-full, so all storage alarms
		// for this server should be cleared (including fired/silenced ones).
		api.runtime.sendMessage({
			type: "CLEAR_STALE_STORAGE",
			activeNames,
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.warehouse.isFetching = false;
	}
}

// ==========================================
// CELEBRATIONS FETCHER
// ==========================================
async function fetchCelebrationsData() {
	if (!canFetch("celebrations", 60000)) return;

	try {
		const res = await fetch(
			window.location.origin + "/village/statistics/culturepoints",
		);
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, "text/html");

		const table = doc.getElementById("culture_points");
		if (!table) return;

		const newAlarms = [];
		const activeNames = [];

		table.querySelectorAll("tbody tr").forEach((row) => {
			const vilNode = row.querySelector(".vil");
			const celNode = row.querySelector(".cel");
			if (!vilNode || !celNode) return;

			const aNode = vilNode.querySelector("a");
			const vName = cleanText(aNode ? aNode.textContent : vilNode.textContent);
			const delay = parseCellDelay(celNode);

			if (delay > 0) {
				const alarmName = `🎉 Celebrations Ends In | ${vName} ${serverTag}`;
				activeNames.push(alarmName);
				newAlarms.push({ name: alarmName, delay, customType: "culture" });
			}
		});

		if (newAlarms.length > 0) {
			await api.runtime.sendMessage({
				type: "REFRESH_ALARMS",
				buildings: newAlarms,
			});
		}

		// Always clean up stale/duplicate celebration alarms after a
		// successful fetch — even when no active celebrations remain.
		// keepExpired in the handler preserves fired alarms for user dismissal.
		api.runtime.sendMessage({
			type: "CLEAR_STALE_CELEBRATIONS",
			activeNames,
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.celebrations.isFetching = false;
	}
}

// ==========================================
// PERIODIC RALLY POINT CHECK FOR VILLAGES UNDER ATTACK
// ==========================================
async function checkResourceVillageAttacks() {
	// Seed the throttle from the persisted timestamp so a page refresh doesn't
	// reset the 10-minute cooldown and re-fire a newdid= burst shortly after
	// every load (same reload-race as the rally cooldown in
	// scanForSidebarAttacksAndFetch).
	if (fetchState.attackCheck.lastTime === 0) {
		fetchState.attackCheck.lastTime =
			parseInt(localStorage.getItem(`_twAtkChkTs_${serverTag}`), 10) || 0;
	}
	if (!canFetch("attackCheck", 600000)) return; // 10 minutes
	try {
		localStorage.setItem(
			`_twAtkChkTs_${serverTag}`,
			String(fetchState.attackCheck.lastTime),
		);
	} catch {
		/* silenced */
	}

	// Find villages with active resource/storage alarms
	const resourceVillages = new Set();
	currentAlarms.forEach((a) => {
		if (
			(a.customType === "resource" || a.customType === "storage") &&
			a.name.includes(serverTag)
		) {
			const match = a.name.match(/\|\s*(.+?)\s*\[/);
			if (match) resourceVillages.add(match[1].trim());
		}
	});
	if (resourceVillages.size === 0) return;

	// Find villages under attack (from sidebar)
	const attackedVillages = new Set();
	const listEntries = document.querySelectorAll(
		".villageList .listEntry.attack",
	);
	listEntries.forEach((entry) => {
		const nameNode = entry.querySelector(".name");
		if (nameNode) attackedVillages.add(cleanText(nameNode.innerText));
	});
	// Also check existing attack alarms
	currentAlarms.forEach((a) => {
		if (a.customType === "attack" && a.name.includes(serverTag)) {
			const match = a.name.match(/Attack on (.+?)[\s(]/);
			if (match) attackedVillages.add(match[1].trim());
		}
	});

	// Find villages that are under attack
	const villagesToCheck = [];
	resourceVillages.forEach((vName) => {
		if (attackedVillages.has(vName)) {
			// Reverse lookup VID from globalVillageMap
			const entry = Object.entries(globalVillageMap).find(
				([, name]) => name === vName,
			);
			if (entry) villagesToCheck.push(entry[0]);
		}
	});
	if (villagesToCheck.length === 0) return;

	// Fetch rally point for each attacked village
	try {
		await withVillageLock(async () => {
			for (const vid of villagesToCheck) {
				if (isFetchingRally) break;
				const attacks = await fetchAndParseRallyPoint(vid);
				if (attacks && attacks.length > 0) {
					api.runtime.sendMessage({
						type: "REFRESH_ALARMS",
						buildings: attacks,
					});
				}
			}
		});
	} catch {
		// Fetch errors are non-critical, silently ignore
	} finally {
		fetchState.attackCheck.isFetching = false;
	}
}

// ==========================================
// DUAL-ALARM ATTACK SYSTEM (REMOTE FETCH)
// ==========================================

function scanForSidebarAttacksAndFetch() {
	const villagesToFetch = new Set();

	const listEntries = document.querySelectorAll(".villageList .listEntry");
	// No village-list sidebar rendered on this page (reports, statistics,
	// fullscreen map, or a mid-re-render frame) → we have zero visibility into
	// incoming attacks. Absence of `.attack` markers here is NOT evidence the
	// attack ended; leave the background lifecycle unchanged.
	if (listEntries.length === 0) return;
	listEntries.forEach((entry) => {
		// Travian moved the incoming-attack marker off the .listEntry class and
		// onto an inner icon: `<span class="incomingTroops"><svg class="attack">`.
		// The old `entry.classList.contains("attack")` check matched nothing after
		// that change, so every entry bailed here, no rally fetch was ever queued,
		// so no rally fetch was queued.
		if (!entry.querySelector(".incomingTroops svg.attack")) return;

		// An explicit incoming marker is authoritative. A hero elsewhere in
		// this village, or an unrelated open tooltip, cannot negate it.

		// 1. EXTRACT DATA
		const link = entry.querySelector("a");
		const isActive = entry.classList.contains("active");
		let vid = null;

		if (link && link.href) {
			const match = link.href.match(/newdid=(\d+)/);
			if (match) vid = match[1];
		}
		// Travian moved the village id off the sidebar href (now just `dorf1.php#`)
		// onto a `data-did` attribute on the <li>. Without this fallback, every
		// non-active attacked village fails vid lookup and skips the rally-point fetch.
		if (!vid) vid = entry.getAttribute("data-did") || null;

		// 2. QUEUE FETCH (cooldown enforced below)
		if (vid) {
			villagesToFetch.add(vid);
		} else if (isActive) {
			villagesToFetch.add("CURRENT");
		}
	});

	// 3. EXECUTE FETCHES (For Trackers)
	// Cooldown is generous (60s) — each rally fetch opens a window where
	// Travian's server-side active village briefly points at the attacked
	// village, and a refresh during that window lands the user on the wrong
	// village. 60s detection delay for new waves is the cost we pay for not
	// thrashing the active village.
	const now = Date.now();
	// The cooldown must survive page reloads: lastRallyFetchTime resets to 0
	// on every refresh, so without the persisted timestamp a refresh while
	// under attack fired a newdid= burst within the first second of every
	// page load — exactly when the user is about to click something, which is
	// how they kept landing on the attacked village. localStorage also shares
	// the cooldown across tabs.
	const persistedRallyTs =
		parseInt(localStorage.getItem(`_twRallyTs_${serverTag}`), 10) || 0;
	if (
		villagesToFetch.size > 0 &&
		!isFetchingRally &&
		now - Math.max(lastRallyFetchTime, persistedRallyTs) > 60000
	) {
		lastRallyFetchTime = now;
		try {
			localStorage.setItem(`_twRallyTs_${serverTag}`, String(now));
		} catch {
			/* silenced */
		}

		const fetchOrder = Array.from(villagesToFetch);
		withVillageLock(async () => {
			const fetchPromises = fetchOrder.map((idKey) => {
				const vid = idKey === "CURRENT" ? null : idKey;
				return fetchAndParseRallyPoint(vid);
			});
			const results = await Promise.allSettled(fetchPromises);
			const allFetchedAlarms = [];
			results.forEach((res) => {
				if (res.status === "fulfilled" && res.value) {
					allFetchedAlarms.push(...res.value);
				}
			});
			if (allFetchedAlarms.length > 0) {
				api.runtime.sendMessage({
					type: "REFRESH_ALARMS",
					buildings: allFetchedAlarms,
				});
			}
		}).catch(() => {});
	}

	// Absence in a cached sidebar is not an authoritative cancellation.
	// The background expires known attacks at their recorded impact time.
}

// Fetch attack observations for detection and imminent-warning phases.
async function fetchAndParseRallyPoint(vid) {
	isFetchingRally = true;

	let url =
		window.location.origin + "/build.php?gid=16&tt=1&filter=1&subfilters=1";
	if (vid) {
		url += `&newdid=${vid}`;
		_noteNewdidTarget(vid);
	}

	try {
		const response = await fetch(url);
		if (!response.ok) return [];
		const text = await response.text();
		const observedAt = Date.now();
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/html");

		const foundAlarms = [];
		const infoBodies = doc.querySelectorAll("tbody.infos");

		// 1) Collect all attacks
		const attacks = [];
		infoBodies.forEach((infoBody) => {
			const timer = infoBody.querySelector(".timer");
			if (!timer) return;
			const seconds = parseInt(timer.getAttribute("value"), 10);
			if (isNaN(seconds) || seconds <= 0) return;

			let headlineText = "Unknown Attack";
			let sibling = infoBody.previousElementSibling;
			while (sibling) {
				if (sibling.tagName === "THEAD") {
					const headline = sibling.querySelector(".troopHeadline");
					if (headline) headlineText = cleanText(headline.textContent || "");
					break;
				}
				sibling = sibling.previousElementSibling;
			}
			attacks.push({ headlineText, seconds });
		});

		// A "wave" is defined by IMPACT proximity, not detection proximity:
		// attacks of the same headline whose impacts land within WAVE_WINDOW_S
		// of each other are real cata-wave patterns and collapse into one
		// alarm. Anything spaced further apart in impact time stays as
		// distinct alarms (even if they were detected in the same fetch).
		attacks.sort((a, b) => a.seconds - b.seconds);
		const WAVE_WINDOW_S = 5;
		const clusters = [];
		attacks.forEach((atk) => {
			const last = clusters.findLast(cluster => cluster.headlineText === atk.headlineText);
			if (
				last &&
				last.headlineText === atk.headlineText &&
				atk.seconds - last.firstSeconds <= WAVE_WINDOW_S
			) {
				last.count++;
				last.lastSeconds = atk.seconds;
			} else {
				clusters.push({
					headlineText: atk.headlineText,
					firstSeconds: atk.seconds,
					lastSeconds: atk.seconds,
					count: 1,
				});
			}
		});

		// Always report observations. The background owns durable deduplication;
		// a tab's cached alarm list must not control notification state.
		const pad = n => String(n).padStart(2, "0");
		const villageId = String(vid || _readDidFromSidebar(doc) || "CURRENT");
		clusters.forEach(({ headlineText, firstSeconds, lastSeconds, count }) => {
			const impactAt = observedAt + firstSeconds * 1000;
			const impactDate = new Date(impactAt);
			const impactStr = `${pad(impactDate.getHours())}:${pad(impactDate.getMinutes())}:${pad(impactDate.getSeconds())}`;
			const waveLabel = count > 1 ? ` (wave ×${count})` : "";
			const attackScope = JSON.stringify([window.location.hostname, villageId, headlineText]);
			const shared = { customType: "attack", attackScope, impactAt, waveEndAt: observedAt + lastSeconds * 1000, waveCount: count };
			if (firstSeconds > 20) {
				foundAlarms.push({ ...shared,
					name: `⚠️ Attack Imminent: ${headlineText}${waveLabel} @ ${impactStr} ${serverTag}`,
					attackPhase: "imminent", dueAt: impactAt - 20000,
					delay: firstSeconds * 1000 - 20000,
				});
			}
			const village = (headlineText.match(/(?:attacks|raids)\s+(.+)/i) || [])[1] || headlineText;
			foundAlarms.push({ ...shared,
				name: `🚨 Attack on ${village}${waveLabel} @ ${impactStr} ${serverTag}`,
				attackPhase: "detected", dueAt: observedAt, delay: 0,
			});
		});

		return foundAlarms;
	} catch (e) {
		// silenced
		return [];
	} finally {
		isFetchingRally = false;
	}
}

// ==========================================
// HERO FETCHER
// ==========================================

// Hero status codes from Travian GQL schema
const HERO_STATUS = {
	IDLE: 1,
	REVIVING: 2,
	TRAVEL_ADVENTURE: 50,
	TRAVEL_OASIS: 4,
	TRAVEL_REINFORCE: 5,
	TRAVEL_RAID: 6,
	TRAVEL_ATTACK: 3,
	RETURN_ADVENTURE: 8,
	RETURN_OTHER: 9,
};

/**
 * Fetches /hero/adventures, extracts the pre-rendered viewData JSON, and
 * upserts a hero alarm. Works from any page — no live DOM dependency.
 */
async function fetchHeroData() {
	if (!canFetch("hero", 60000)) return;

	try {
		const res = await fetch(window.location.origin + "/hero/adventures");
		const html = await res.text();

		// Extract the viewData JSON using brace-depth counting
		const viewDataIdx = html.indexOf("viewData: ");
		if (viewDataIdx === -1) return;
		const jsonStart = viewDataIdx + "viewData: ".length;

		let depth = 0,
			i = jsonStart,
			inStr = false,
			escape = false;
		for (; i < html.length && i < jsonStart + 100000; i++) {
			const c = html[i];
			if (escape) {
				escape = false;
				continue;
			}
			if (c === "\\" && inStr) {
				escape = true;
				continue;
			}
			if (c === '"') {
				inStr = !inStr;
				continue;
			}
			if (inStr) continue;
			if (c === "{") depth++;
			else if (c === "}") {
				depth--;
				if (depth === 0) break;
			}
		}

		let heroData;
		try {
			const parsed = JSON.parse(html.substring(jsonStart, i + 1));
			heroData = parsed?.data?.ownPlayer?.hero;
		} catch {
			return;
		}

		if (!heroData) return;

		const status = heroData.status;
		const homeVillage = heroData.homeVillage?.name || "";

		// No status or hero is idle/reviving — clear stale alarms
		if (
			!status ||
			status.status === HERO_STATUS.IDLE ||
			status.status === HERO_STATUS.REVIVING
		) {
			api.runtime.sendMessage({
				type: "CLEAR_STALE_HERO",
				activeNames: [],
				serverTag,
			});
			return;
		}

		const arrivalIn = status.arrivalIn; // seconds
		if (!arrivalIn || arrivalIn <= 0) return;
		const delayMs = arrivalIn * 1000 + 2000;

		const isReturning =
			status.status === HERO_STATUS.RETURN_ADVENTURE ||
			status.status === HERO_STATUS.RETURN_OTHER;

		// Hero always returns home — use homeVillage for all alarms
		const villagePart = homeVillage ? ` | ${homeVillage}` : "";

		// Target village name (only set when hero is travelling to a village,
		// e.g. attacks/raids). status.onWayTo.village.name is the destination.
		const targetVillage = status.onWayTo?.village?.name || "";

		let actionLabel;
		switch (status.status) {
			case HERO_STATUS.TRAVEL_ADVENTURE:
				actionLabel = "Going to Adventure";
				break;
			case HERO_STATUS.RETURN_ADVENTURE:
				actionLabel = "Returning";
				break;
			case HERO_STATUS.TRAVEL_OASIS:
				actionLabel = "Going to Oasis";
				break;
			case HERO_STATUS.TRAVEL_REINFORCE:
				actionLabel = "Reinforcing";
				break;
			case HERO_STATUS.TRAVEL_RAID:
			case HERO_STATUS.TRAVEL_ATTACK:
				actionLabel = targetVillage
					? `Attacking ${targetVillage}`
					: "Attacking";
				break;
			default:
				actionLabel = "Returning";
		}

		const alarmName = `⚔️ ${actionLabel}${villagePart} ${serverTag}`;

		await api.runtime.sendMessage({
			type: "REFRESH_ALARMS",
			buildings: [
				{
					name: alarmName,
					delay: delayMs,
					customType: "hero",
					noSound: !isReturning,
				},
			],
		});

		api.runtime.sendMessage({
			type: "CLEAR_STALE_HERO",
			activeNames: [alarmName],
			serverTag,
		});
	} catch {
		// Fetch errors are non-critical
	} finally {
		fetchState.hero.isFetching = false;
	}
}
