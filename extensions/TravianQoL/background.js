// Background worker for TravianQoL features that need privileged APIs
// (chrome.tabs.create, chrome.contextMenus) — these can't be called from a
// content script.
//
// Two responsibilities:
//   1. open background tabs on request from the report-opener feature.
//   2. own the "Calculate Troops Needed" context menu for loot-calc, and
//      forward the click to the active tab as an OPEN_CALCULATOR message.
//
// Both feature-specific code paths early-return when the feature is
// disabled in chrome.storage.sync, so the QoL toggle in the options page
// is the single source of truth.

const ENABLED_KEY = 'travianQoL.enabled';
const CONTEXT_MENU_ID = 'travianqol-loot-calc';

function isFeatureEnabled(id) {
	return new Promise((resolve) => {
		chrome.storage.sync.get([ENABLED_KEY], (res) => {
			const map = res[ENABLED_KEY] || {};
			// Default is enabled — matches the loader in content.js.
			resolve(map[id] !== false);
		});
	});
}

// --- report-opener: open a list of URLs as background tabs ---
// --- loot-calc: forward OPEN_CALCULATOR with the selection text ---
chrome.runtime.onMessage.addListener((request) => {
	if (!request) return;
	if (request.action === 'qol_open_tabs' && Array.isArray(request.urls)) {
		request.urls.forEach((url) => {
			chrome.tabs.create({ url, active: false });
		});
	}
});

// --- Context menu lifecycle ---
// Re-creating on every install/update is the safe pattern (contextMenus.create
// throws if the id already exists, so we remove-then-add). We do NOT condition
// menu existence on the feature toggle — toggling would require listening to
// storage changes here, and the click handler already gates on the toggle.
function installContextMenu() {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: CONTEXT_MENU_ID,
			title: 'Calculate Troops Needed',
			contexts: ['selection'],
		});
	});
}
chrome.runtime.onInstalled.addListener(installContextMenu);
chrome.runtime.onStartup.addListener(installContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId !== CONTEXT_MENU_ID) return;
	if (!(await isFeatureEnabled('loot-calc'))) return;
	if (!tab || !tab.id) return;
	chrome.tabs
		.sendMessage(tab.id, { type: 'OPEN_CALCULATOR', selection: info.selectionText })
		.catch(() => {
			// Content script not loaded on this page (e.g. chrome://new-tab) — ignore.
		});
});
