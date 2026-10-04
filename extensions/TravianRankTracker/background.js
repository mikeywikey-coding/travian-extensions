// Load shared utilities (replaces the multi-script manifest pattern)
importScripts("utils.js");

/**
 * Travian Rank Tracker — Background Worker (v5.0)
 *
 * Responsible for periodic data collection via browser alarms.
 *
 * Root-cause fix (v5.0):
 *   Previously the alarm was ONLY registered inside `onInstalled`, which does
 *   not fire on browser restart or when the extension's event page is revived.
 *   If the alarm was lost (e.g. after a browser restart), background fetching
 *   silently stopped until the user manually reinstalled.
 *
 *   Additionally, when the Travian session expired overnight, `fetchForServer`
 *   detected the login page and silently returned — with no logging and no
 *   diagnostic breadcrumb.  Every subsequent 30-minute alarm fired into the
 *   void, producing the gap the user observed on the graph.
 *
 * Fixes applied:
 *   1. Added `runtime.onStartup` to guarantee the alarm always exists.
 *   2. Added `ensureAlarm()` helper that is also called on every alarm tick
 *      as a belt-and-suspenders measure.
 *   3. Each fetch now writes a diagnostic status to storage so the popup can
 *      surface "Session expired — please log in" instead of showing stale data.
 *   4. Consolidated the multi-endpoint fetch into `fetchAllEndpoints()` in
 *      utils.js to eliminate the duplicated logic that was in both bg and popup.
 */

const ALARM_NAME = "fetchRankStats";
const ALARM_PERIOD_MINUTES = 30;
const api = chrome;

/* ─── Alarm Scheduling ───────────────────────────────────────────────── */

/**
 * Compute the millisecond timestamp of the next clock-aligned half-hour
 * (e.g. 14:00, 14:30, 15:00 …).
 */
function getNextHalfHour() {
	const now = new Date();
	const next = new Date(now);
	if (now.getMinutes() >= 30) {
		next.setHours(now.getHours() + 1, 0, 0, 0);
	} else {
		next.setHours(now.getHours(), 30, 0, 0);
	}
	return next.getTime();
}

/**
 * Guarantee the periodic alarm exists.  Safe to call repeatedly — it
 * checks for an existing alarm first and only creates one if missing.
 */
async function ensureAlarm() {
	try {
		const existing = await api.alarms.get(ALARM_NAME);
		if (existing) return; // alarm already registered, nothing to do
	} catch (_) {
		// `alarms.get` can throw in some Chrome builds — fall through to create
	}

	await api.alarms.create(ALARM_NAME, {
		when: getNextHalfHour(),
		periodInMinutes: ALARM_PERIOD_MINUTES,
	});
}

/* ─── Event Listeners ────────────────────────────────────────────────── */

/**
 * FIX: `onInstalled` + `onStartup` together cover every lifecycle edge-case:
 *   • onInstalled  → first install, update, or browser-triggered reload
 *   • onStartup    → every browser launch (does NOT fire on install)
 */
api.runtime.onInstalled.addListener(async () => {
	await api.alarms.clear(ALARM_NAME).catch(() => {});
	await ensureAlarm();
	performBackgroundFetch(); // immediate first fetch
});

api.runtime.onStartup.addListener(async () => {
	await ensureAlarm();
	performBackgroundFetch(); // fetch on every browser launch
});

api.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== ALARM_NAME) return;

	// Belt-and-suspenders: make sure the alarm still has a valid period.
	// Some browsers discard the `periodInMinutes` after waking from sleep.
	await ensureAlarm();

	performBackgroundFetch();
});

/* ─── Core Fetch Logic ───────────────────────────────────────────────── */

/**
 * Iterate over every known Travian server and collect data.
 * Reads the server list from storage; falls back to the legacy single-server key.
 */
async function performBackgroundFetch() {
	const storageRes = await api.storage.local.get(["serverUrl", "serverUrls"]);

	const serverList = storageRes.serverUrls?.length
		? storageRes.serverUrls
		: storageRes.serverUrl ? [storageRes.serverUrl] : [];
	if (serverList.length === 0) return;

	for (const serverOrigin of serverList) {
		if (!serverOrigin) continue;
		const storageKey = `history_${serverOrigin}`;

		// `fetchAllEndpoints` handles all 4 HTTP requests, merging, and persistence.
		// It also writes a diagnostic status we can surface in the popup.
		await fetchAllEndpoints(serverOrigin, api, storageKey);
	}
}
