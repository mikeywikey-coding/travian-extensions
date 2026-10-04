// Options page: renders one toggle per registered feature, plus a separate
// "Loot Calculator" tab that edits LootCalc's per-server settings.
//
// We do NOT call feature.init() here — the options page is not a Travian tab,
// so feature init would have nothing useful to do. We only read/write the
// enabled-map; the content script applies it on each Travian page. Same
// rationale for loot-calc: this page just edits chrome.storage.local values,
// and the in-page loot-calc feature picks them up on next load.
(function () {
	const KEY = window.TravianQoL.STORAGE_KEY;

	// ---- Tabs (rail items) ----
	// Keep aria-selected in sync with the visual is-active state so screen
	// readers and assistive tech announce the active tab correctly.
	const tabs = document.querySelectorAll('.rail__item[data-tab]');
	const panels = document.querySelectorAll('.panel');
	function activateTab(tab) {
		tabs.forEach((t) => {
			const active = t === tab;
			t.classList.toggle('is-active', active);
			t.setAttribute('aria-selected', active ? 'true' : 'false');
			t.setAttribute('tabindex', active ? '0' : '-1');
		});
		panels.forEach((p) => p.classList.toggle('is-active', p.id === `tab-${tab.dataset.tab}`));
	}
	tabs.forEach((tab) => {
		tab.addEventListener('click', () => activateTab(tab));
		// Arrow-key navigation between tabs — standard WAI-ARIA tablist pattern.
		tab.addEventListener('keydown', (e) => {
			const list = [...tabs];
			const i = list.indexOf(tab);
			if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
				e.preventDefault();
				const next = list[(i + 1) % list.length];
				next.focus(); activateTab(next);
			} else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
				e.preventDefault();
				const prev = list[(i - 1 + list.length) % list.length];
				prev.focus(); activateTab(prev);
			} else if (e.key === 'Home') {
				e.preventDefault();
				list[0].focus(); activateTab(list[0]);
			} else if (e.key === 'End') {
				e.preventDefault();
				list[list.length - 1].focus(); activateTab(list[list.length - 1]);
			}
		});
	});

	// Live "saved" indicator — call flashSaved() after any change that has
	// already been persisted, so the user sees the rail footer briefly
	// acknowledge the write.
	const saveStatus = document.getElementById('save-status');
	let saveFlashTimer = null;
	function flashSaved() {
		if (!saveStatus) return;
		saveStatus.classList.add('is-saving');
		saveStatus.querySelector('span:last-child').textContent = 'saved · just now';
		clearTimeout(saveFlashTimer);
		saveFlashTimer = setTimeout(() => {
			saveStatus.classList.remove('is-saving');
			saveStatus.querySelector('span:last-child').textContent = 'autosaved';
		}, 1600);
	}

	// ---- Features tab ----
	const featuresRoot = document.getElementById('features');
	const featureCountEl = document.getElementById('feature-active-count');
	function updateFeatureCount(enabled) {
		const total = window.TravianQoL.features.length;
		const active = window.TravianQoL.features.filter((f) => enabled[f.id] !== false).length;
		if (featureCountEl) featureCountEl.textContent = `${active}/${total}`;
	}
	function renderFeatures(enabled) {
		featuresRoot.innerHTML = '';
		updateFeatureCount(enabled);
		for (const feature of window.TravianQoL.features) {
			const row = document.createElement('label');
			row.className = 'feature';
			// Description moves to native tooltip in the compact popup
			// layout so the row fits on a single line. Screen readers
			// also read this on focus.
			if (feature.description) row.title = feature.description;
			const cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.checked = enabled[feature.id] !== false;
			cb.addEventListener('change', () => {
				enabled[feature.id] = cb.checked;
				chrome.storage.sync.set({ [KEY]: enabled }, flashSaved);
				updateFeatureCount(enabled);
			});
			const meta = document.createElement('div');
			meta.className = 'meta';
			const label = document.createElement('div');
			label.className = 'label';
			const labelText = document.createElement('span');
			labelText.textContent = feature.label || feature.id;
			label.appendChild(labelText);
			// A small scope tag next to the label. "Hot" means destroy() can
			// tear the feature down live; "Page" means it needs a page reload
			// to apply. Derived from whether the module exposes destroy().
			const tag = document.createElement('span');
			const isHot = typeof feature.destroy === 'function';
			tag.className = 'tag ' + (isHot ? 'tag--hot' : 'tag--page');
			tag.textContent = isHot ? 'Hot-toggle' : 'On refresh';
			label.appendChild(tag);
			const desc = document.createElement('div');
			desc.className = 'desc';
			desc.textContent = feature.description || '';
			meta.append(label, desc);
			row.append(cb, meta);
			featuresRoot.append(row);
		}
	}
	chrome.storage.sync.get([KEY], (res) => {
		renderFeatures(res[KEY] || {});
	});

	// ---- Loot Calculator tab ----
	// Per-server keys look like `tlw_<setting>_<hostname>`. We discover every
	// hostname we've ever stored anything for and present them in a dropdown,
	// headed by a "Default (all servers)" entry stored under the `global`
	// pseudo-hostname that every server falls back to.
	const LC_SETTING_KEYS = ['auto_unit', 'auto_enabled', 'tribe', 'debug', 'offset_x', 'offset_y'];
	const DEFAULT_OFFSET_X = 3;
	const DEFAULT_OFFSET_Y = 0;

	// Unit caps mirror features/loot-calc/index.js. Shown next to each name so
	// the dropdown reads the same as the in-page calculator.
	const BASE_TRIBES = {
		Romans: [['Legionnaire', 50], ['Praetorian', 20], ['Imperian', 50], ['Equites Imperatoris', 100], ['Equites Caesaris', 70]],
		Teutons: [['Clubswinger', 60], ['Axeman', 50], ['Paladin', 110], ['Teutonic Knight', 80]],
		Gauls: [['Phalanx', 35], ['Swordsman', 45], ['Theutates Thunder', 75], ['Druidrider', 35], ['Haeduan', 65]],
		Egyptians: [['Slave Militia', 15], ['Ash Warden', 50], ['Khopesh Warrior', 45], ['Anhur Guard', 50], ['Resheph Chariot', 70]],
		Huns: [['Mercenary', 50], ['Bowman', 30], ['Steppe Rider', 75], ['Marksman', 105], ['Marauder', 80]],
		Spartans: [['Hoplite', 60], ['Shieldsman', 40], ['Twinsteel Therion', 50], ['Elpida Rider', 110], ['Corinthian Crusher', 80]],
	};

	// Sentinel for the "Default (all servers)" entry in the server dropdown.
	// Its settings live under the `global` scope and are the fallback the
	// content script uses on any server that has no override of its own --
	// which is what makes a brand-new server work without opening the
	// in-page calculator first.
	const LC_GLOBAL = '__global__';

	const serverSelect = document.getElementById('lc-server');
	const settingsRoot = document.getElementById('lc-settings');

	// Global defaults are stored under the pseudo-server `global`, except the
	// default unit, which is per tribe (`tlw_auto_unit_global_<Tribe>`) so a
	// Teuton server and a Gaul server can each start with a sensible unit.
	function lcKey(setting, server, tribe) {
		if (server === LC_GLOBAL) {
			return setting === 'auto_unit' ? `tlw_auto_unit_global_${tribe}` : `tlw_${setting}_global`;
		}
		return `tlw_${setting}_${server}`;
	}

	function isGlobalScope(server) {
		return server === 'global' || server.startsWith('global_');
	}

	function discoverServers() {
		return new Promise((resolve) => {
			chrome.storage.local.get(null, (all) => {
				const servers = new Set();
				for (const k of Object.keys(all)) {
					// Match tlw_<setting>_<server> where <setting> is one of our known keys.
					for (const s of LC_SETTING_KEYS) {
						const prefix = `tlw_${s}_`;
						if (k.startsWith(prefix)) {
							const server = k.slice(prefix.length);
							// Skip the global-scope keys: they are the
							// "Default (all servers)" entry, not a server.
							if (!isGlobalScope(server)) servers.add(server);
							break;
						}
					}
				}
				resolve([...servers].sort());
			});
		});
	}

	// Servers with their own `tlw_auto_unit_<host>` ignore the global default
	// entirely. That precedence is right, but silent: the global view has to
	// say so, or changing the default there looks like it does nothing.
	async function findUnitOverrides() {
		const all = await chrome.storage.local.get(null);
		const prefix = 'tlw_auto_unit_';
		const found = [];
		for (const [k, v] of Object.entries(all)) {
			if (!k.startsWith(prefix) || !v) continue;
			const host = k.slice(prefix.length);
			if (isGlobalScope(host)) continue;
			found.push({ host, unit: v });
		}
		return found.sort((a, b) => a.host.localeCompare(b.host));
	}

	// Hostname of the Travian tab the user is on, or null. Note this needs no
	// "tabs" permission: tab.url is populated for any tab the extension holds a
	// host permission for, which is exactly the Travian domains. (Passing a
	// `url` filter to query() *would* require it, so we filter ourselves.)
	async function detectCurrentServer() {
		try {
			const tabs = await chrome.tabs.query({});
			const travian = tabs.filter((t) => t.url && /^https?:\/\/[^/]*\.travian\.[a-z.]+(\/|$)/i.test(t.url));
			if (travian.length === 0) return null;
			// The active tab wins; otherwise just take the first Travian tab.
			const tab = travian.find((t) => t.active) || travian[0];
			return new URL(tab.url).hostname;
		} catch {
			return null;
		}
	}

	async function renderServerSettings(server) {
		const isGlobal = server === LC_GLOBAL;
		const tribeKeys = Object.keys(BASE_TRIBES);
		const keys = ['auto_enabled', 'tribe', 'debug', 'offset_x', 'offset_y'].map((s) => lcKey(s, server));
		// Global units are read in both modes: in per-server mode they name the
		// value the "(none)" option actually falls back to.
		keys.push(...tribeKeys.map((t) => lcKey('auto_unit', LC_GLOBAL, t)));
		if (!isGlobal) keys.push(lcKey('auto_unit', server));
		const res = await chrome.storage.local.get(keys);

		const autoEnabled = res[lcKey('auto_enabled', server)] ?? true;
		const debug = res[lcKey('debug', server)] ?? false;
		const offX = res[lcKey('offset_x', server)] ?? DEFAULT_OFFSET_X;
		const offY = res[lcKey('offset_y', server)] ?? DEFAULT_OFFSET_Y;
		// In global scope the tribe select picks *which tribe's* default unit
		// you are editing; land on one that already has a unit saved.
		const tribe = isGlobal
			? tribeKeys.find((t) => res[lcKey('auto_unit', server, t)]) || 'Teutons'
			: res[lcKey('tribe', server)] || 'Teutons';

		settingsRoot.innerHTML = '';

		if (isGlobal) {
			const note = document.createElement('div');
			note.className = 'lc-empty';
			note.textContent =
				'Used on every server that has no settings of its own. A new server picks up the default unit for whichever tribe it detects you playing.';
			settingsRoot.appendChild(note);
		}

		// Bind label -> input via `for`/`id` so screen readers announce the
		// label when the select gains focus.
		const tribeRow = document.createElement('div');
		tribeRow.className = 'lc-row';
		const tribeLbl = document.createElement('label');
		tribeLbl.htmlFor = 'lc-tribe';
		tribeLbl.textContent = isGlobal ? 'Default unit for tribe' : 'Tribe';
		tribeRow.appendChild(tribeLbl);
		const tribeSel = document.createElement('select');
		tribeSel.id = 'lc-tribe';
		for (const t of tribeKeys) {
			const opt = document.createElement('option');
			opt.value = t;
			opt.textContent = t;
			if (t === tribe) opt.selected = true;
			tribeSel.appendChild(opt);
		}
		tribeRow.appendChild(tribeSel);

		const unitRow = document.createElement('div');
		unitRow.className = 'lc-row';
		const unitLbl = document.createElement('label');
		unitLbl.htmlFor = 'lc-unit';
		unitLbl.textContent = 'Default Unit';
		unitRow.appendChild(unitLbl);
		const unitSel = document.createElement('select');
		unitSel.id = 'lc-unit';
		function fillUnits(forTribe) {
			const selected = isGlobal
				? res[lcKey('auto_unit', server, forTribe)] || ''
				: res[lcKey('auto_unit', server)] || '';
			const fallback = res[lcKey('auto_unit', LC_GLOBAL, forTribe)];
			unitSel.innerHTML = '';
			const blank = document.createElement('option');
			blank.value = '';
			blank.textContent = !isGlobal && fallback ? `(use default: ${fallback})` : '(none)';
			unitSel.appendChild(blank);
			for (const [name, cap] of BASE_TRIBES[forTribe] || []) {
				const opt = document.createElement('option');
				opt.value = name;
				opt.textContent = `${name} (${cap})`;
				if (name === selected) opt.selected = true;
				unitSel.appendChild(opt);
			}
		}
		fillUnits(tribe);
		unitRow.appendChild(unitSel);

		const autoRow = document.createElement('label');
		autoRow.className = 'lc-row lc-row--check';
		const autoChk = document.createElement('input');
		autoChk.type = 'checkbox';
		autoChk.checked = !!autoEnabled;
		autoRow.append(autoChk, document.createTextNode(' Show unit badges on report pages'));

		const debugRow = document.createElement('label');
		debugRow.className = 'lc-row lc-row--check';
		const debugChk = document.createElement('input');
		debugChk.type = 'checkbox';
		debugChk.checked = !!debug;
		debugRow.append(debugChk, document.createTextNode(' Enable debug logging'));

		const offRow = document.createElement('div');
		offRow.className = 'lc-row';
		const offLbl = document.createElement('label');
		offLbl.htmlFor = 'lc-offx';
		offLbl.textContent = 'Badge offset (X / Y)';
		offRow.appendChild(offLbl);
		const offXInput = document.createElement('input');
		offXInput.type = 'number';
		offXInput.id = 'lc-offx';
		offXInput.value = offX;
		offXInput.className = 'lc-num';
		offXInput.setAttribute('aria-label', 'Badge X offset');
		const offYInput = document.createElement('input');
		offYInput.type = 'number';
		offYInput.value = offY;
		offYInput.className = 'lc-num';
		offYInput.setAttribute('aria-label', 'Badge Y offset');
		offRow.append(offXInput, offYInput);

		settingsRoot.append(tribeRow, unitRow, autoRow, debugRow, offRow);

		// Global view only: name the servers that shadow this default, and
		// offer to drop their overrides so it takes effect everywhere.
		if (isGlobal) {
			const overrideRow = document.createElement('div');
			overrideRow.className = 'lc-empty lc-override';
			unitRow.after(overrideRow);
			const renderOverrides = async () => {
				const overrides = await findUnitOverrides();
				overrideRow.innerHTML = '';
				overrideRow.hidden = overrides.length === 0;
				if (overrides.length === 0) return;
				const text = document.createElement('span');
				text.textContent =
					`${overrides.length} server${overrides.length === 1 ? '' : 's'} ignore this default, ` +
					`having a unit of their own: ${overrides.map((o) => `${o.host} (${o.unit})`).join(', ')}.`;
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'lc-reset';
				btn.textContent = 'Clear server overrides';
				btn.onclick = async () => {
					await chrome.storage.local.remove(overrides.map((o) => `tlw_auto_unit_${o.host}`));
					flashSaved();
					renderOverrides();
				};
				overrideRow.append(text, btn);
			};
			renderOverrides();
		}

		// Persist on change. We write each setting individually so partial
		// edits are immediately visible to the in-page feature.
		tribeSel.onchange = () => {
			// Global scope: the tribe select is a filter, not a saved setting.
			if (!isGlobal) chrome.storage.local.set({ [lcKey('tribe', server)]: tribeSel.value }, flashSaved);
			fillUnits(tribeSel.value);
		};
		unitSel.onchange = () => {
			const key = lcKey('auto_unit', server, tribeSel.value);
			res[key] = unitSel.value;
			chrome.storage.local.set({ [key]: unitSel.value }, flashSaved);
		};
		autoChk.onchange = () => chrome.storage.local.set({ [lcKey('auto_enabled', server)]: autoChk.checked }, flashSaved);
		debugChk.onchange = () => chrome.storage.local.set({ [lcKey('debug', server)]: debugChk.checked }, flashSaved);
		offXInput.oninput = () => {
			const v = parseInt(offXInput.value, 10);
			if (Number.isFinite(v)) chrome.storage.local.set({ [lcKey('offset_x', server)]: v }, flashSaved);
		};
		offYInput.oninput = () => {
			const v = parseInt(offYInput.value, 10);
			if (Number.isFinite(v)) chrome.storage.local.set({ [lcKey('offset_y', server)]: v }, flashSaved);
		};
	}

	// ---- Skip Ads tab ----
	const SA_DEFAULTS = {
		'skipAds.debug': false,
		'skipAds.minPlaytime': 0.4,
		'skipAds.videoLookupPollRate': 50,
		'skipAds.videoSkipPollRate': 300,
	};
	const saRoot = document.getElementById('sa-settings');

	function renderSkipAds(values) {
		saRoot.innerHTML = '';

		function addNumberRow(key, label, step) {
			const row = document.createElement('div');
			row.className = 'lc-row';
			const inputId = `sa-${key.replace(/[^a-z0-9]+/gi, '-')}`;
			const lbl = document.createElement('label');
			lbl.htmlFor = inputId;
			lbl.textContent = label;
			const inp = document.createElement('input');
			inp.type = 'number';
			inp.id = inputId;
			inp.className = 'lc-num';
			inp.value = values[key];
			if (step) inp.step = step;
			inp.oninput = () => {
				const v = parseFloat(inp.value);
				if (Number.isFinite(v)) chrome.storage.local.set({ [key]: v }, flashSaved);
			};
			row.append(lbl, inp);
			saRoot.appendChild(row);
		}

		const debugRow = document.createElement('label');
		debugRow.className = 'lc-row lc-row--check';
		const debugChk = document.createElement('input');
		debugChk.type = 'checkbox';
		debugChk.checked = !!values['skipAds.debug'];
		debugChk.onchange = () => chrome.storage.local.set({ 'skipAds.debug': debugChk.checked }, flashSaved);
		debugRow.append(debugChk, document.createTextNode(' Enable debug logging'));
		saRoot.appendChild(debugRow);

		addNumberRow('skipAds.minPlaytime', 'Min playtime (s)', '0.1');
		addNumberRow('skipAds.videoLookupPollRate', 'Video lookup poll (ms)', '5');
		addNumberRow('skipAds.videoSkipPollRate', 'Video skip poll (ms)', '5');

		const reset = document.createElement('button');
		reset.textContent = 'Reset to defaults';
		reset.className = 'lc-reset';
		reset.onclick = () => {
			chrome.storage.local.set(SA_DEFAULTS, () => {
				renderSkipAds(SA_DEFAULTS);
				flashSaved();
			});
		};
		saRoot.appendChild(reset);
	}

	chrome.storage.local.get(Object.keys(SA_DEFAULTS), (res) => {
		const merged = { ...SA_DEFAULTS, ...res };
		renderSkipAds(merged);
	});

	async function initLootCalcTab() {
		const servers = await discoverServers();
		const current = await detectCurrentServer();
		// A server visited for the first time has no keys yet, so discovery
		// misses it — add it so its settings are editable right away.
		if (current && !servers.includes(current)) {
			servers.push(current);
			servers.sort();
		}

		serverSelect.innerHTML = '';
		// "Default (all servers)" is always present, so the default unit can be
		// set before ever visiting a new server. It is not the initial
		// selection though: the server being played is the useful one to land
		// on, and editing the default by accident is the confusing case.
		const globalOpt = document.createElement('option');
		globalOpt.value = LC_GLOBAL;
		globalOpt.textContent = 'Default (all servers)';
		serverSelect.appendChild(globalOpt);
		for (const s of servers) {
			const opt = document.createElement('option');
			opt.value = s;
			opt.textContent = s === current ? `${s} (current)` : s;
			serverSelect.appendChild(opt);
		}

		const initial = current || LC_GLOBAL;
		serverSelect.value = initial;
		serverSelect.onchange = () => renderServerSettings(serverSelect.value);
		renderServerSettings(initial);
	}
	initLootCalcTab();

	// =====================================================================
	// Counter-attack tab
	// =====================================================================
	// Mirrors inactivesearch.it/tools/counter-attack-calculator: take an
	// incoming attack's arrival time + the attacker's slowest unit + both
	// villages' coords, compute (a) when their army returns home, and
	// (b) when you must launch a counter to land at that same moment.
	(function initCounterAttackTab() {
		const root = document.getElementById('tab-counter');
		if (!root) return;

		// Canonical Travian unit speeds (fields/hour) by tribe, including
		// the slow late-game units that usually pace an attack (rams, catas,
		// chiefs, settlers). Grouped in the dropdown by tribe.
		const UNITS = {
			Romans: [
				['Legionnaire', 6], ['Praetorian', 5], ['Imperian', 7],
				['Equites Legati', 16], ['Equites Imperatoris', 14], ['Equites Caesaris', 10],
				['Battering Ram', 4], ['Fire Catapult', 3], ['Senator', 4], ['Settler', 5],
			],
			Teutons: [
				['Clubswinger', 7], ['Spearman', 7], ['Axeman', 6], ['Scout', 9],
				['Paladin', 10], ['Teutonic Knight', 9],
				['Ram', 4], ['Catapult', 3], ['Chief', 4], ['Settler', 5],
			],
			Gauls: [
				['Phalanx', 7], ['Swordsman', 6], ['Pathfinder', 17],
				['Theutates Thunder', 19], ['Druidrider', 16], ['Haeduan', 13],
				['Ram', 4], ['Trebuchet', 3], ['Chieftain', 5], ['Settler', 5],
			],
			Egyptians: [
				['Slave Militia', 7], ['Ash Warden', 6], ['Khopesh Warrior', 7],
				['Sopdu Explorer', 16], ['Anhur Guard', 15], ['Resheph Chariot', 10],
				['Ram', 4], ['Stone Catapult', 3], ['Nomarch', 4], ['Settler', 5],
			],
			Huns: [
				['Mercenary', 6], ['Bowman', 6], ['Spotter', 19],
				['Steppe Rider', 16], ['Marksman', 14], ['Marauder', 13],
				['Ram', 4], ['Catapult', 3], ['Logades', 5], ['Settler', 5],
			],
			Spartans: [
				['Hoplite', 7], ['Sentinel', 9], ['Shieldsman', 7],
				['Twinsteel Therion', 6], ['Elpida Rider', 16], ['Corinthian Crusher', 13],
				['Ram', 4], ['Ballista', 3], ['Ephor', 5], ['Settler', 5],
			],
		};

		function populateUnitSelect(sel) {
			sel.innerHTML = '';
			for (const tribe of Object.keys(UNITS)) {
				const g = document.createElement('optgroup');
				g.label = tribe;
				for (const [name, speed] of UNITS[tribe]) {
					const o = document.createElement('option');
					o.value = String(speed);
					o.textContent = `${name} — ${speed} f/h`;
					g.appendChild(o);
				}
				sel.appendChild(g);
			}
		}
		function populateTsSelect(sel) {
			sel.innerHTML = '';
			for (let i = 0; i <= 20; i++) {
				const o = document.createElement('option');
				o.value = String(i);
				o.textContent = i === 0 ? '—' : String(i);
				sel.appendChild(o);
			}
		}

		root.querySelectorAll('select[data-att="speed"], select[data-int="speed"]').forEach(populateUnitSelect);
		root.querySelectorAll('select[data-att="ts"], select[data-int="ts"]').forEach(populateTsSelect);

		// Village picker for the interceptor — populated from the village
		// snapshot the content script writes to chrome.storage.local on
		// every Travian page load. Stays hidden until a snapshot exists.
		const intCoordsEl = root.querySelector('[data-int="coords"]');
		const villagePicker = document.getElementById('ca-int-village');
		// The picker now lives in its own grid cell — hide the whole
		// field (the wrapping <label>) when there's no snapshot, not just
		// the <select>, so the column gap collapses cleanly.
		const villageField = villagePicker.closest('.ca__field');
		function loadVillages(snapshot) {
			const list = snapshot?.list || [];
			if (!list.length) { villageField.hidden = true; return; }
			villagePicker.innerHTML = '';
			const placeholder = document.createElement('option');
			placeholder.value = '';
			placeholder.textContent = `— pick (${list.length}) —`;
			villagePicker.appendChild(placeholder);
			for (const v of list) {
				const o = document.createElement('option');
				o.value = `(${v.x}|${v.y})`;
				o.textContent = `${v.name} (${v.x}|${v.y})`;
				villagePicker.appendChild(o);
			}
			villageField.hidden = false;
		}
		villagePicker.addEventListener('change', () => {
			if (!villagePicker.value) return;
			intCoordsEl.value = villagePicker.value;
			intCoordsEl.dispatchEvent(new Event('input', { bubbles: true }));
			villagePicker.selectedIndex = 0;
		});
		chrome.storage.local.get(['travianQoL.villages'], (res) => loadVillages(res['travianQoL.villages']));
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === 'local' && changes['travianQoL.villages']) {
				loadVillages(changes['travianQoL.villages'].newValue);
			}
		});

		// Sensible defaults: slowest units on each side default to ram/cata.
		root.querySelector('select[data-att="speed"]').value = '4';
		root.querySelector('select[data-int="speed"]').value = '4';

		// Pre-fill arrival time with "now + 30 min" so the user has a
		// concrete starting point.
		const arrivalEl = document.getElementById('ca-arrival');
		(function () {
			const t = new Date(Date.now() + 30 * 60 * 1000);
			const pad = (n) => String(n).padStart(2, '0');
			arrivalEl.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
		})();

		// Persist inputs across sessions. Arrival time is intentionally
		// excluded — it auto-prefills to now+30m, which beats restoring a
		// stale timestamp from a previous session.
		const STORAGE_KEY = 'travianQoL.counterAttack.inputs';
		const PERSIST_IDS = ['ca-target', 'ca-server-speed', 'ca-map'];
		const PERSIST_DATA = [
			['att', 'coords'], ['att', 'speed'], ['att', 'ts'], ['att', 'boots'], ['att', 'art'],
			['int', 'coords'], ['int', 'speed'], ['int', 'ts'], ['int', 'boots'], ['int', 'art'],
		];
		function snapshotInputs() {
			const data = {};
			for (const id of PERSIST_IDS) {
				const el = document.getElementById(id);
				if (el) data[id] = el.value;
			}
			for (const [side, key] of PERSIST_DATA) {
				const el = root.querySelector(`[data-${side}="${key}"]`);
				if (el) data[`${side}.${key}`] = el.value;
			}
			return data;
		}
		function restoreInputs(data) {
			if (!data) return;
			for (const id of PERSIST_IDS) {
				if (data[id] != null) {
					const el = document.getElementById(id);
					if (el) el.value = data[id];
				}
			}
			for (const [side, key] of PERSIST_DATA) {
				const v = data[`${side}.${key}`];
				if (v == null) continue;
				const el = root.querySelector(`[data-${side}="${key}"]`);
				if (el) el.value = v;
			}
		}
		let saveTimer = null;
		function scheduleSave() {
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				chrome.storage.local.set({ [STORAGE_KEY]: snapshotInputs() });
			}, 250);
		}
		chrome.storage.local.get([STORAGE_KEY], (res) => {
			restoreInputs(res[STORAGE_KEY]);
			recompute();
		});

		// --- math ---
		function parseCoords(str) {
			if (!str) return null;
			const m = String(str).match(/-?\d+/g);
			if (!m || m.length < 2) return null;
			return { x: parseInt(m[0], 10), y: parseInt(m[1], 10) };
		}
		function torusDistance(a, b, mapSize) {
			// Map is square with coords in [-S/2 .. +S/2]; wrap-around uses
			// `mapSize` (200/400/800) as the perimeter.
			const dx = Math.min(Math.abs(a.x - b.x), mapSize - Math.abs(a.x - b.x));
			const dy = Math.min(Math.abs(a.y - b.y), mapSize - Math.abs(a.y - b.y));
			return Math.sqrt(dx * dx + dy * dy);
		}
		function travelSeconds(dist, baseSpeed, serverSpeed, artefact, bootsMult, tsLevel) {
			// fields/hour after all multipliers
			const speed = baseSpeed * serverSpeed * artefact * bootsMult;
			if (!Number.isFinite(speed) || speed <= 0) return Infinity;
			if (dist <= 20) return (dist / speed) * 3600;
			// TS only boosts the portion beyond 20 fields; +20% per level.
			const tsBonus = 1 + 0.2 * tsLevel;
			const beyond = dist - 20;
			return (20 / speed + beyond / (speed * tsBonus)) * 3600;
		}
		function fmtDuration(sec) {
			if (!Number.isFinite(sec) || sec < 0) return '—';
			sec = Math.round(sec);
			const h = Math.floor(sec / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = sec % 60;
			const pad = (n) => String(n).padStart(2, '0');
			return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
		}
		function fmtTime(d) {
			if (!(d instanceof Date) || isNaN(d)) return '—';
			const pad = (n) => String(n).padStart(2, '0');
			const same = (a, b) =>
				a.getFullYear() === b.getFullYear() &&
				a.getMonth() === b.getMonth() &&
				a.getDate() === b.getDate();
			const today = new Date();
			const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
			const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
			if (same(d, today)) return stamp;
			if (same(d, tomorrow)) return `tomorrow ${stamp}`;
			return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${stamp}`;
		}

		const outEl = document.getElementById('ca-out');
		function read(side, key) {
			const el = root.querySelector(`[data-${side}="${key}"]`);
			return el ? el.value : '';
		}

		// Last computed plan; consumed by the countdown tick so we can refresh
		// the "launch in / too late" banner once per second without redoing
		// the trig on every frame.
		let plan = null;

		function escapeHtml(s) {
			return String(s).replace(/[&<>"']/g, (c) => ({
				'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
			}[c]));
		}

		// Vertical sequence of the events that matter, in time order. A
		// stacked rail can never overlap (unlike the old horizontal strip),
		// so no collision/stagger logic is needed — just render rows.
		// `events` arrive pre-sorted; the last row drops its connector line.
		function buildSequence(events) {
			const rows = events.map((e, i) => {
				const isLast = i === events.length - 1;
				return `
					<div class="ca__seq-row" data-kind="${e.kind}">
						<span class="ca__seq-time">${escapeHtml(fmtTime(e.t))}</span>
						<span class="ca__seq-rail">
							<span class="ca__seq-dot"></span>
							${isLast ? '' : '<span class="ca__seq-line"></span>'}
						</span>
						<span class="ca__seq-body">
							<span class="ca__seq-label">${escapeHtml(e.label)}</span>
							${e.desc ? `<span class="ca__seq-desc">${escapeHtml(e.desc)}</span>` : ''}
						</span>
					</div>`;
			}).join('');
			return `
				<div class="ca__seq">
					<div class="ca__seq-head">Sequence</div>
					${rows}
				</div>`;
		}

		function statusFor(launchAt) {
			// No counter target → neutral banner.
			if (!launchAt) {
				return { cls: '', label: 'Waiting', value: '—', sub: 'Add interceptor coords to plan a counter.' };
			}
			const ms = launchAt.getTime() - Date.now();
			if (ms <= -1000) {
				return { cls: 'ca__answer--bad', label: 'Too late', value: 'MISSED', sub: `Should have launched ${fmtDuration(-ms / 1000)} ago.` };
			}
			if (ms <= 10_000) {
				return { cls: 'ca__answer--bad', label: 'Launch now', value: 'NOW', sub: 'Send the counter immediately.' };
			}
			if (ms <= 10 * 60 * 1000) {
				return { cls: 'ca__answer--warn', label: 'Launch in', value: fmtDuration(ms / 1000), sub: `at ${fmtTime(launchAt)}` };
			}
			return { cls: 'ca__answer--ok', label: 'Launch in', value: fmtDuration(ms / 1000), sub: `at ${fmtTime(launchAt)}` };
		}

		// Re-render just the answer block — cheap; runs once per second.
		function renderStatus(launchAt) {
			const s = statusFor(launchAt);
			const node = outEl.querySelector('.ca__answer');
			if (!node) return;
			node.className = `ca__answer ${s.cls}`.trim();
			node.querySelector('.ca__answer-label').textContent = s.label;
			node.querySelector('.ca__countdown').textContent = s.value;
			node.querySelector('.ca__answer-note').textContent = s.sub;
		}

		function recompute() {
			const target = parseCoords(document.getElementById('ca-target').value);
			const att = parseCoords(read('att', 'coords'));
			const inter = parseCoords(read('int', 'coords'));
			const arrival = arrivalEl.value ? new Date(arrivalEl.value) : null;
			const serverSpeed = parseFloat(document.getElementById('ca-server-speed').value) || 1;
			const mapSize = parseInt(document.getElementById('ca-map').value, 10) || 400;

			const aSpeed = parseFloat(read('att', 'speed')) || 0;
			const aTs = parseInt(read('att', 'ts'), 10) || 0;
			const aBoots = parseFloat(read('att', 'boots')) || 1;
			const aArt = parseFloat(read('att', 'art')) || 1;

			const iSpeed = parseFloat(read('int', 'speed')) || 0;
			const iTs = parseInt(read('int', 'ts'), 10) || 0;
			const iBoots = parseFloat(read('int', 'boots')) || 1;
			const iArt = parseFloat(read('int', 'art')) || 1;

			const errs = [];
			if (!target) errs.push('target coords');
			if (!att) errs.push('attacker coords');
			if (!arrival || isNaN(arrival)) errs.push('arrival time');
			if (errs.length) {
				outEl.className = 'ca__out';
				outEl.innerHTML = `<div class="ca__hint">Fill ${errs.join(', ')} to calculate.</div>`;
				plan = null;
				return;
			}

			// 1) Distance + travel times for the incoming attack.
			const distAtt = torusDistance(target, att, mapSize);
			const tAtt = travelSeconds(distAtt, aSpeed, serverSpeed, aArt, aBoots, aTs);
			const depart = new Date(arrival.getTime() - tAtt * 1000);
			const returns = new Date(arrival.getTime() + tAtt * 1000);

			// 2) Counter — must land on the attacker's village the moment
			//    their army gets back home.
			let distInt = 0, tInt = 0, counterDepart = null;
			if (inter && iSpeed > 0) {
				distInt = torusDistance(att, inter, mapSize);
				tInt = travelSeconds(distInt, iSpeed, serverSpeed, iArt, iBoots, iTs);
				counterDepart = new Date(returns.getTime() - tInt * 1000);
			}

			plan = { counterDepart };

			// Sequence events in time order. Arrival is user input; the
			// calculated moments are `returns` (attacker army home) and the
			// counter launch. Each carries a short desc for the sequence rail.
			const events = [];
			events.push({ t: arrival, kind: 'hit-us', label: 'Attack hits us', desc: 'their army turns for home' });
			if (counterDepart) events.push({ t: counterDepart, kind: 'counter', label: 'Launch your counter \u2192', desc: `travel ${fmtDuration(tInt)} \u00b7 ${distInt.toFixed(1)} f` });
			events.push({ t: returns, kind: 'return', label: 'Army home \u00b7 counter lands', desc: counterDepart ? 'snipe connects' : 'attacker army back home' });
			events.sort((a, b) => a.t - b.t);

			// Bottom raw strip — distances + counter travel only. Each side
			// is a grid cell; CSS draws the divider between them so it aligns
			// with the answer/sequence column boundary above.
			const rawCounter = counterDepart
				? `<span><b>Counter</b> ${distInt.toFixed(1)} f \u00b7 travel ${fmtDuration(tInt)}</span>`
				: '';

			outEl.className = 'ca__out ca__out--rich';
			outEl.innerHTML = `
				<div class="ca__plan">
					<div class="ca__answer">
						<span class="ca__answer-label"></span>
						<span class="ca__countdown"></span>
						<span class="ca__answer-note"></span>
					</div>
					${buildSequence(events)}
				</div>
				<div class="ca__raw">
					<span><b>Att</b> ${distAtt.toFixed(1)} f</span>
					${rawCounter}
				</div>`;

			renderStatus(counterDepart);
		}

		// Wire up live recompute on any change/input within the panel.
		root.addEventListener('input', () => { recompute(); scheduleSave(); });
		root.addEventListener('change', () => { recompute(); scheduleSave(); });
		// 1-Hz countdown refresh — cheap, only touches the answer block. Tracked
		// so we can drop it on page unload (cleanliness, not necessity).
		const tickId = setInterval(() => { if (plan) renderStatus(plan.counterDepart); }, 1000);
		window.addEventListener('beforeunload', () => clearInterval(tickId), { once: true });
		recompute();
		// Note: chrome.storage.local.get above will call recompute() again
		// once the persisted snapshot loads. The synchronous call here keeps
		// the "fill X to calculate" hint visible during that brief window.
	})();
})();
