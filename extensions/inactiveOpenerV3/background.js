// background.js

// Chrome/Firefox cross-browser shim: Chrome lacks the `browser` global
const browser = globalThis.browser ?? chrome; // eslint-disable-line no-undef
const jitter = (ms) => Math.round(ms * (0.7 + Math.random() * 0.8));

let tabQueue = [];
let totalVillages = 0;
let processedCount = 0;
let activeTabs = new Set();
let getterTabId = null;
let openInBackground = false;

let currentRunId = 0;

browser.storage.local.get(["queueState"]).then(restoreState);

function restoreState(data) {
	if (data.queueState) {
		tabQueue = data.queueState.tabQueue || [];
		totalVillages = data.queueState.totalVillages || 0;
		processedCount = data.queueState.processedCount || 0;
		getterTabId = data.queueState.getterTabId || null;
		openInBackground = !!data.queueState.openInBackground;
		activeTabs.clear();
	}
}

function saveState() {
	browser.storage.local
		.set({ queueState: { tabQueue, totalVillages, processedCount, getterTabId, openInBackground } })
		.catch(() => {});
}

function cancelRun() {
	currentRunId++;
	if (spawnTimer !== null) {
		clearTimeout(spawnTimer);
		spawnTimer = null;
	}
	activeTabs.forEach((id) => browser.tabs.remove(id).catch(() => {}));
	activeTabs.clear();
}

browser.runtime.onMessage.addListener((msg, sender) => {
	switch (msg.type) {
		case "START_QUEUE":
			cancelRun();
			tabQueue = msg.urls || [];
			totalVillages = tabQueue.length;
			processedCount = 0;
			openInBackground = !!msg.openInBackground;
			if (sender.tab?.id) getterTabId = sender.tab.id;
			saveState();
			streamQueue();
			break;

		case "STOP_QUEUE":
			cancelRun();
			tabQueue = [];
			totalVillages = 0;
			processedCount = 0;
			saveState();
			break;
	}
});

browser.tabs.onRemoved.addListener((tabId) => activeTabs.delete(tabId));

const SPAWN_DELAY_MS = 300;
let spawnTimer = null;

function streamQueue() {
	if (spawnTimer !== null) return;
	if (tabQueue.length === 0) return;

	spawnNextTab();
	scheduleNextSpawn();
}

function scheduleNextSpawn() {
	if (spawnTimer !== null) return;
	if (tabQueue.length === 0) return;

	spawnTimer = setTimeout(() => {
		spawnTimer = null;
		if (tabQueue.length === 0) return;
		spawnNextTab();
		scheduleNextSpawn();
	}, jitter(SPAWN_DELAY_MS));
}

function spawnNextTab() {
	if (tabQueue.length === 0) return;

	const url = tabQueue.shift();
	processedCount++;
	const capturedRunId = currentRunId;
	saveState();

	browser.tabs
		.create({ url, active: !openInBackground })
		.then((tab) => {
			if (currentRunId !== capturedRunId) {
				if (tab?.id) browser.tabs.remove(tab.id).catch(() => {});
				return;
			}
			if (tab?.id) activeTabs.add(tab.id);
		})
		.catch(() => {})
		.finally(updateGetterUI);
}

function updateGetterUI() {
	if (!getterTabId) return;
	browser.tabs
		.sendMessage(getterTabId, {
			type: "UPDATE_PROGRESS",
			processed: processedCount,
			total: totalVillages,
			done: totalVillages > 0 && tabQueue.length === 0,
		})
		.catch(() => {});
}
