// Loader: reads which features are enabled from chrome.storage.sync, then
// initialises each enabled feature exactly once. Also listens for storage
// changes so toggling a feature in the options page takes effect without a
// full reload (when the feature provides destroy()).
(function () {
	const KEY = window.TravianQoL.STORAGE_KEY;
	const features = window.TravianQoL.features;
	const live = new Map(); // id -> feature (currently initialised)

	function applyState(enabledMap) {
		for (const feature of features) {
			// Default to enabled if the user hasn't explicitly toggled the feature.
			const want = enabledMap[feature.id] !== false;
			const isLive = live.has(feature.id);
			if (want && !isLive) {
				try {
					feature.init();
					live.set(feature.id, feature);
				} catch (err) {
					console.error(`[TravianQoL] ${feature.id} init failed`, err);
				}
			} else if (!want && isLive) {
				try {
					feature.destroy?.();
				} catch (err) {
					console.error(`[TravianQoL] ${feature.id} destroy failed`, err);
				}
				live.delete(feature.id);
			}
		}
	}

	chrome.storage.sync.get([KEY], (res) => {
		applyState(res[KEY] || {});
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'sync' || !changes[KEY]) return;
		applyState(changes[KEY].newValue || {});
	});

	// --- Village-list snapshot ------------------------------------------
	// Scrape the player's villages from the sidebar on every page load and
	// stash them in chrome.storage.local. The options page (Counter-Attack
	// tab) reads this to offer a one-click "use my village" picker for the
	// interceptor coords.
	function scrapeVillages() {
		const items = document.querySelectorAll(
			'#sidebarBoxVillagelist .listEntry, .villageList .listEntry'
		);
		const out = [];
		for (const item of items) {
			const nameEl = item.querySelector('.name') || item;
			const name = (nameEl.innerText || '').trim().split('\n')[0].trim();
			let x = null, y = null;
			const grid = item.querySelector('.coordinatesGrid');
			if (grid) {
				const xt = grid.querySelector('.coordinateX')?.innerText;
				const yt = grid.querySelector('.coordinateY')?.innerText;
				if (xt && yt) {
					// Sidebar coords come bracketed and with Travian's curly minus.
					x = parseInt(xt.replace(/[^\d\-−]/g, '').replace('−', '-'), 10);
					y = parseInt(yt.replace(/[^\d\-−]/g, '').replace('−', '-'), 10);
				}
			}
			if (x == null || y == null) {
				const m = (item.innerText || '').match(/\(?\s*(-?\d+)\s*[|/]\s*(-?\d+)\s*\)?/);
				if (m) { x = parseInt(m[1], 10); y = parseInt(m[2], 10); }
			}
			if (x == null || y == null) continue;
			out.push({ name: name || `(${x}|${y})`, x, y });
		}
		if (!out.length) return false;
		// Write only when the list changed — this runs on every page load.
		const KEY = 'travianQoL.villages';
		chrome.storage.local.get(KEY, (res) => {
			if (JSON.stringify(res[KEY]?.list) === JSON.stringify(out)) return;
			chrome.storage.local.set({ [KEY]: { list: out, updatedAt: Date.now() } });
		});
		return true;
	}
	// Defer slightly: the sidebar can render after document_idle.
	setTimeout(() => scrapeVillages() || setTimeout(scrapeVillages, 2000), 500);
})();
