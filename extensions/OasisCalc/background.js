// Service worker — only purpose is to expose OasisCalc's known-oases database
// to other locally installed Travian extensions (FarmList Pro) via the
// externally_connectable bridge declared in manifest.json.
//
// Storage layout (set by content scripts on /karte.php):
//   db_<hostname>      — array of "x|y" strings (keys of the knownOases Set)
//   sc_<hostname>      — scan-result entries (Map serialized as Array of [k, v])
//
// The reply is intentionally minimal: an array of {x, y} pairs for the
// requested host. The caller filters by radius/center on its side.

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
	if (!msg || typeof msg !== 'object') return;

	if (msg.type === 'oasiscalc:exportOases') {
		(async () => {
			try {
				const host = String(msg.host || '').trim();
				if (!host) { sendResponse({ ok: false, error: 'host is required' }); return; }
				const key = `db_${host}`;
				const stored = await chrome.storage.local.get(key);
				const raw = stored[key] || [];
				const oases = [];
				for (const k of raw) {
					if (typeof k !== 'string') continue;
					const [xs, ys] = k.split('|');
					const x = parseInt(xs, 10);
					const y = parseInt(ys, 10);
					if (Number.isFinite(x) && Number.isFinite(y)) oases.push({ x, y });
				}
				sendResponse({ ok: true, host, oases });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}

	// Export scan results (oases with their detected animal composition) for the
	// given host. Used by FarmList Pro's animals column on oasis lists.
	if (msg.type === 'oasiscalc:exportScan') {
		(async () => {
			try {
				const host = String(msg.host || '').trim();
				if (!host) { sendResponse({ ok: false, error: 'host is required' }); return; }
				const key = `sc_${host}`;
				const stored = await chrome.storage.local.get(key);
				const raw = stored[key] || [];
				const oases = [];
				for (const entry of raw) {
					// resultsMap was serialized as Array<[k, v]> where v = {x, y, animals: [{id, count}]}
					const v = Array.isArray(entry) ? entry[1] : entry;
					if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') continue;
					const animals = Array.isArray(v.animals)
						? v.animals.filter(a => a && Number.isFinite(a.id) && Number.isFinite(a.count) && a.count > 0)
						: [];
					oases.push({ x: v.x, y: v.y, animals });
				}
				sendResponse({ ok: true, host, oases });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}

	if (msg.type === 'oasiscalc:listHosts') {
		(async () => {
			try {
				const all = await chrome.storage.local.get(null);
				const hosts = Object.keys(all)
					.filter(k => k.startsWith('db_'))
					.map(k => k.slice(3));
				sendResponse({ ok: true, hosts });
			} catch (e) {
				sendResponse({ ok: false, error: e.message });
			}
		})();
		return true;
	}
});
