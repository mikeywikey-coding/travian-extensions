"use strict";
importScripts("shared.js", "data.js");
const {
	api,
	serverOrigin,
	parsePage,
	mergeScan,
	updateVillage,
	storageKey,
	targetCpKey,
	logKey,
	CP_REQUIREMENTS,
	normalizeSpeed,
	predictSettlement,
	defaultTarget,
	forecastInputs,
	forecastEntry,
	appendForecastLog,
} = TSP;

// All read/modify/write operations run here, in order, across every context.
let writes = Promise.resolve();
function serialize(operation) {
	const result = writes.then(operation);
	writes = result.catch((error) => console.warn("CP Planner:", error.message));
	return result;
}
const pendingFetches = new Map();
const NOTIFICATION_ID = "tsp-alarm-notif";
const ALARM_KEY = "tsp_alarm_state";

// Forecast history for tuning the model. Call only inside serialize().
async function recordForecast(origin, reason) {
	const key = storageKey(origin);
	const stored = await api.storage.local.get([
		key,
		targetCpKey(origin),
		logKey(origin),
	]);
	const data = stored[key];
	const target = stored[targetCpKey(origin)] || defaultTarget(data);
	const entry = forecastEntry(
		data,
		target,
		Date.now(),
		reason,
		api.runtime.getManifest?.().version,
	);
	if (!entry) return;
	const previous = stored[logKey(origin)] || [];
	const log = appendForecastLog(previous, entry);
	if (log.length !== previous.length || log.at(-1) !== previous.at(-1))
		await api.storage.local.set({ [logKey(origin)]: log });
}

async function saveScan(origin, scan) {
	if (!scan?.hasData) return false;
	await serialize(async () => {
		const key = storageKey(origin);
		const stored = await api.storage.local.get([
			key,
			"tsp_servers",
			"tsp_last_viewed",
		]);
		const servers = [
			...new Set([...(stored.tsp_servers || []).filter(serverOrigin), origin]),
		];
		await api.storage.local.set({
			[key]: mergeScan(stored[key], scan),
			tsp_servers: servers,
			...(!servers.includes(stored.tsp_last_viewed)
				? { tsp_last_viewed: origin }
				: {}),
		});
		await recordForecast(origin, "scan");
	});
	return true;
}

async function gameTabs(origin) {
	return (await api.tabs.query({})).filter(
		(tab) => tab.id != null && serverOrigin(tab.url) === origin,
	);
}
async function stopAudio(origin) {
	if (!origin) return;
	await Promise.allSettled(
		(await gameTabs(origin)).map((tab) =>
			api.tabs.sendMessage(tab.id, { action: "STOP_ALARM" }),
		),
	);
}
async function clearActive(state) {
	if (!state.active) return;
	await stopAudio(state.active.origin);
	await api.notifications.clear(NOTIFICATION_ID);
	state.active = null;
	await api.storage.local.set({ [ALARM_KEY]: state });
}
async function checkAlarmCondition() {
	const meta = await api.storage.local.get([
		"tsp_servers",
		"tsp_last_viewed",
		"tsp_is_muted",
		ALARM_KEY,
	]);
	const servers = (meta.tsp_servers || []).filter(serverOrigin);
	const origin = servers.includes(meta.tsp_last_viewed)
		? meta.tsp_last_viewed
		: servers[0];
	if (origin && origin !== meta.tsp_last_viewed)
		await api.storage.local.set({ tsp_last_viewed: origin });
	const state = meta[ALARM_KEY] || { active: null, dismissed: {} };
	state.dismissed ||= {};
	let target = 0,
		ready = false;
	if (origin && !meta.tsp_is_muted) {
		const stored = await api.storage.local.get([
			storageKey(origin),
			targetCpKey(origin),
		]);
		const data = stored[storageKey(origin)];
		if (data?.lastUpdate) {
			target = stored[targetCpKey(origin)];
			if (!target) {
				target = defaultTarget(data);
				await api.storage.local.set({ [targetCpKey(origin)]: target });
			}
			// Hypothetical celebrations never count as current CP for alarms.
			const result = predictSettlement({
				...forecastInputs(data, target, Date.now()),
				villages: [],
			});
			ready = result.currentCp >= target && state.dismissed[origin] !== target;
		}
	}
	if (
		state.active &&
		(!ready || state.active.origin !== origin || state.active.target !== target)
	)
		await clearActive(state);
	if (!ready || state.active) return;
	const tabs = await gameTabs(origin);
	const audioTab = tabs.find((tab) => tab.active) || tabs[0];
	await api.notifications.create(NOTIFICATION_ID, {
		type: "basic",
		iconUrl: "icon128.png",
		title: "Settlement CP target reached",
		message: "Your estimated CP has reached the target. Click to dismiss.",
		priority: 2,
	});
	state.active = { origin, target, audioTabId: audioTab?.id ?? null };
	await api.storage.local.set({ [ALARM_KEY]: state });
	if (audioTab)
		await api.tabs
			.sendMessage(audioTab.id, { action: "PLAY_ALARM" })
			.catch(() => {});
}
async function dismissAlarm() {
	const stored = await api.storage.local.get(ALARM_KEY);
	const state = stored[ALARM_KEY];
	if (!state?.active) return;
	state.dismissed ||= {};
	state.dismissed[state.active.origin] = state.active.target;
	await clearActive(state);
}

// Fetch only on the scheduled refresh or an explicit popup request. A worker
// wake must not reset the five-minute schedule or initiate another scan.
async function ensureAlarms() {
	for (const [name, periodInMinutes] of [
		["checkCP", 1],
		["autoFetchCP", 5],
	]) {
		if (!(await api.alarms.get(name)))
			await api.alarms.create(name, { periodInMinutes });
	}
}
async function fetchPage(origin, pathname) {
	const observedAt = Date.now();
	const response = await fetch(origin + pathname, {
		credentials: "include",
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok || (response.url && serverOrigin(response.url) !== origin))
		return null;
	const scan = parsePage(await response.text(), origin, observedAt);
	return scan.hasData ? scan : null;
}
function fetchServerData(origin) {
	if (pendingFetches.has(origin)) return pendingFetches.get(origin);
	const work = (async () => {
		await api.action.setBadgeText({ text: "⟳" });
		try {
			const results = await Promise.allSettled([
				fetchPage(origin, "/statistics/general"),
				fetchPage(origin, "/village/statistics/culturepoints"),
			]);
			let success = false;
			for (const result of results) {
				if (result.status === "fulfilled" && result.value) {
					await saveScan(origin, result.value);
					success = true;
				}
			}
			await serialize(async () => {
				const key = storageKey(origin);
				const stored = await api.storage.local.get(key);
				await api.storage.local.set({
					[key]: {
						...stored[key],
						lastFetch: Date.now(),
						fetchError: success
							? null
							: "Could not refresh. Open this Travian server and check that you are signed in.",
					},
				});
			});
			return success;
		} finally {
			pendingFetches.delete(origin);
			if (!pendingFetches.size) await api.action.setBadgeText({ text: "" });
		}
	})();
	pendingFetches.set(origin, work);
	return work;
}
async function scanServerPreferTabs(origin) {
	for (const tab of await gameTabs(origin)) {
		try {
			const response = await api.tabs.sendMessage(tab.id, { action: "RESCAN" });
			if (response?.success && response.freshCp) return true;
		} catch {
			/* The tab may have navigated or the extension was reloaded. */
		}
	}
	return fetchServerData(origin);
}
async function refreshServers() {
	const stored = await api.storage.local.get("tsp_servers");
	for (const origin of (stored.tsp_servers || []).filter(serverOrigin))
		await scanServerPreferTabs(origin);
}

const actions = new Set([
	"SAVE_SCAN",
	"FORCE_FETCH",
	"SCAN_SERVER",
	"UPDATE_VILLAGE",
	"SELECT_SERVER",
	"SET_TARGET",
	"SET_MUTED",
	"SYNC_ALARM",
]);
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (!request || !actions.has(request.action)) return;
	(async () => {
		const origin = serverOrigin(request.url);
		if (request.action !== "SET_MUTED" && !origin)
			throw new Error("Invalid server.");
		if (
			sender.url &&
			serverOrigin(sender.url) &&
			serverOrigin(sender.url) !== origin
		)
			throw new Error("Server mismatch.");
		switch (request.action) {
			case "SAVE_SCAN":
				return { success: await saveScan(origin, request.scan) };
			case "FORCE_FETCH":
				return { success: await fetchServerData(origin) };
			case "SCAN_SERVER":
				return { success: await scanServerPreferTabs(origin) };
			case "SYNC_ALARM": {
				const stored = await api.storage.local.get(ALARM_KEY);
				const active = stored[ALARM_KEY]?.active;
				return {
					success: true,
					play:
						active?.origin === origin && active.audioTabId === sender.tab?.id,
				};
			}
			default:
				return serialize(async () => {
					if (request.action === "SET_MUTED")
						await api.storage.local.set({ tsp_is_muted: !!request.muted });
					else if (request.action === "SELECT_SERVER")
						await api.storage.local.set({ tsp_last_viewed: origin });
					else {
						const key = storageKey(origin);
						const stored = await api.storage.local.get([key, ALARM_KEY]);
						if (request.action === "UPDATE_VILLAGE") {
							if (!stored[key]) throw new Error("No village data yet.");
							await api.storage.local.set({
								[key]: updateVillage(
									stored[key],
									request.id,
									request.updates || {},
								),
							});
							await recordForecast(origin, "settings");
						} else if (request.action === "SET_TARGET") {
							const target = Number(request.target);
							if (
								!CP_REQUIREMENTS[normalizeSpeed(stored[key]?.speed)]
									.slice(1)
									.includes(target)
							)
								throw new Error("Invalid target.");
							const state = stored[ALARM_KEY] || {
								active: null,
								dismissed: {},
							};
							state.dismissed ||= {};
							delete state.dismissed[origin];
							await api.storage.local.set({
								[targetCpKey(origin)]: target,
								[ALARM_KEY]: state,
							});
							await recordForecast(origin, "target");
						}
					}
					return { success: true };
				});
		}
	})().then(sendResponse, (error) =>
		sendResponse({ success: false, error: error.message }),
	);
	return true;
});
api.notifications.onClicked.addListener((id) => {
	if (id === NOTIFICATION_ID) serialize(dismissAlarm);
});
api.notifications.onButtonClicked.addListener((id) => {
	if (id === NOTIFICATION_ID) serialize(dismissAlarm);
});
api.notifications.onClosed.addListener((id, byUser) => {
	if (id === NOTIFICATION_ID && byUser) serialize(dismissAlarm);
});
api.storage.onChanged.addListener((changes, area) => {
	if (
		area === "local" &&
		Object.keys(changes).some(
			(key) =>
				key !== ALARM_KEY &&
				(key === "tsp_is_muted" ||
					key === "tsp_last_viewed" ||
					key === "tsp_servers" ||
					key.startsWith("tsp_data_") ||
					key.startsWith("tsp_target_cp_")),
		)
	)
		serialize(checkAlarmCondition);
});
api.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "checkCP") serialize(checkAlarmCondition);
	if (alarm.name === "autoFetchCP")
		refreshServers().catch((error) =>
			console.warn("CP Planner refresh:", error.message),
		);
});
api.runtime.onInstalled.addListener(() => ensureAlarms().catch(console.warn));
api.runtime.onStartup.addListener(() => ensureAlarms().catch(console.warn));
ensureAlarms().catch(console.warn);
serialize(checkAlarmCondition);
