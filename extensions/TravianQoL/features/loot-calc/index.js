// Loot Calculator (ex-LootCalc).
// Right-click selected text on any Travian page → "Calculate Troops Needed"
// opens an in-page overlay that converts the resource amount into the number
// of troops needed to carry it. On report pages, also injects a small badge
// next to every loot value with the equivalent unit count.
//
// Toggle behaviour: when disabled via QoL settings, the OPEN_CALCULATOR
// message is ignored and the MutationObservers/badges shut down. The Chrome
// context-menu item itself lives in background.js and stays installed; the
// background also early-returns when the feature is disabled.
//
// Compliance note: pure read + DOM annotation. The overlay/badges only
// appear in response to direct user actions (right-click, click, hover that
// triggers Travian's own tippy). No automated clicks, no fetches.
(function () {
	const STYLE_ID = 'travian-qol-loot-calc-style';
	let active = false;
	let observer = null;
	let messageHandler = null;
	let storageHandler = null;
	let styleEl = null;

	// ===== TROOP DATA =====
	const BASE_TRIBES = {
		Romans: [
			{ name: 'Legionnaire', cap: 50 },
			{ name: 'Praetorian', cap: 20 },
			{ name: 'Imperian', cap: 50 },
			{ name: 'Equites Imperatoris', cap: 100 },
			{ name: 'Equites Caesaris', cap: 70 },
		],
		Teutons: [
			{ name: 'Clubswinger', cap: 60 },
			{ name: 'Axeman', cap: 50 },
			{ name: 'Paladin', cap: 110 },
			{ name: 'Teutonic Knight', cap: 80 },
		],
		Gauls: [
			{ name: 'Phalanx', cap: 35 },
			{ name: 'Swordsman', cap: 45 },
			{ name: 'Theutates Thunder', cap: 75 },
			{ name: 'Druidrider', cap: 35 },
			{ name: 'Haeduan', cap: 65 },
		],
	};
	const EXTENDED_TRIBES = {
		Egyptians: [
			{ name: 'Slave Militia', cap: 15 },
			{ name: 'Ash Warden', cap: 50 },
			{ name: 'Khopesh Warrior', cap: 45 },
			{ name: 'Anhur Guard', cap: 50 },
			{ name: 'Resheph Chariot', cap: 70 },
		],
		Huns: [
			{ name: 'Mercenary', cap: 50 },
			{ name: 'Bowman', cap: 30 },
			{ name: 'Steppe Rider', cap: 75 },
			{ name: 'Marksman', cap: 105 },
			{ name: 'Marauder', cap: 80 },
		],
		Spartans: [
			{ name: 'Hoplite', cap: 60 },
			{ name: 'Shieldsman', cap: 40 },
			{ name: 'Twinsteel Therion', cap: 50 },
			{ name: 'Elpida Rider', cap: 110 },
			{ name: 'Corinthian Crusher', cap: 80 },
		],
	};
	const TROOP_DATA_ORIGINAL = { ...BASE_TRIBES };
	const TROOP_DATA_REBALANCED = { ...BASE_TRIBES, ...EXTENDED_TRIBES };

	let activeTroopData = TROOP_DATA_REBALANCED;
	const UNIT_CAP_MAP = new Map();
	function rebuildCapMap() {
		UNIT_CAP_MAP.clear();
		for (const tribe in activeTroopData) {
			activeTroopData[tribe].forEach((u) => UNIT_CAP_MAP.set(u.name, u.cap));
		}
	}

	// ===== SERVER TYPE DETECTION =====
	// Travian tribe IDs: 1=Romans, 2=Teutons, 3=Gauls, 5=Egyptians, 6=Huns,
	// 7=Spartans. Each tribe owns a 10-unit ID range (Romans u1-u10, Teutons
	// u11-u20, etc.), which Travian uses for the .uXX CSS class on every
	// troop image throughout the UI. Tallying those classes is far more
	// reliable than scraping inline scripts — works on every page that shows
	// any troop graphic (rally point, reports, hero, statistics, …).
	// Cribbed from automerchant's tribe-detector.js.
	const TRIBE_ID_TO_NAME = {
		1: 'Romans', 2: 'Teutons', 3: 'Gauls',
		5: 'Egyptians', 6: 'Huns', 7: 'Spartans',
	};
	function detectTribe() {
		const counts = { 1: 0, 2: 0, 3: 0, 5: 0, 6: 0, 7: 0 };
		for (const el of document.querySelectorAll('[class*=" u"]')) {
			// Read via getAttribute, not el.className: on SVG elements className is
			// an SVGAnimatedString (no .match), which previously threw and aborted
			// tribe detection. getAttribute('class') is a plain string on any element.
			const match = (el.getAttribute('class') || '').match(/\bu(\d{1,2})\b/);
			if (!match) continue;
			const unitId = Number(match[1]);
			if (unitId >= 1 && unitId <= 10) counts[1]++;
			else if (unitId >= 11 && unitId <= 20) counts[2]++;
			else if (unitId >= 21 && unitId <= 30) counts[3]++;
			else if (unitId >= 51 && unitId <= 60) counts[5]++;
			else if (unitId >= 61 && unitId <= 70) counts[6]++;
			else if (unitId >= 71 && unitId <= 80) counts[7]++;
		}
		let best = null, bestCount = 0;
		for (const [id, c] of Object.entries(counts)) {
			if (c > bestCount) { best = Number(id); bestCount = c; }
		}
		return bestCount > 0 ? best : null;
	}
	function detectServerType() {
		const playerTribe = detectTribe();
		if (playerTribe && playerTribe > 3) return playerTribe >= 8 ? '6-tribe' : '5-tribe';
		let hasTribe8 = false;
		let hasExtended = false;
		for (const script of document.querySelectorAll('script:not([src])')) {
			for (const m of script.textContent.matchAll(/["']?tribeId["']?\s*[:=]\s*(\d)/g)) {
				const id = Number(m[1]);
				if (id >= 8) hasTribe8 = true;
				if (id > 3) hasExtended = true;
			}
		}
		if (hasTribe8) return '6-tribe';
		if (hasExtended) return '5-tribe';
		if (document.querySelector('[class*="tribe8"], .tribe8')) return '6-tribe';
		if (document.querySelector('[class*="tribe6"], [class*="tribe7"], .tribe6, .tribe7')) return '5-tribe';
		return '3-tribe';
	}
	function applyDetectedServerType() {
		const serverType = detectServerType();
		activeTroopData = serverType === '3-tribe' ? TROOP_DATA_ORIGINAL : TROOP_DATA_REBALANCED;
		rebuildCapMap();
		return serverType;
	}

	// ===== STORAGE (per-server, same keys as the legacy extension so settings
	// configured before migration are preserved) =====
	const serverID = window.location.hostname;
	const StorageKeys = {
		autoUnit: () => `tlw_auto_unit_${serverID}`,
		autoEnabled: () => `tlw_auto_enabled_${serverID}`,
		tribe: () => `tlw_tribe_${serverID}`,
		debug: () => `tlw_debug_${serverID}`,
		offsetX: () => `tlw_offset_x_${serverID}`,
		offsetY: () => `tlw_offset_y_${serverID}`,
		lastUnits: () => `tlw_last_units_${serverID}`,
	};
	// Global fallbacks, edited from the QoL popup's "Default (all servers)"
	// entry. Any server without its own value uses these, so a brand-new
	// server already has a default unit without opening the calculator once.
	// The unit is keyed by tribe because the right unit depends on which
	// tribe you ended up playing there.
	const GlobalKeys = {
		autoUnit: (tribe) => `tlw_auto_unit_global_${tribe}`,
		autoEnabled: 'tlw_auto_enabled_global',
		debug: 'tlw_debug_global',
		offsetX: 'tlw_offset_x_global',
		offsetY: 'tlw_offset_y_global',
	};

	// ===== STATE =====
	const DEBOUNCE_DELAY_MS = 100;
	const STORAGE_SAVE_DELAY_MS = 300;
	const TIPPY_INJECT_DELAY_MS = 0;
	const DEFAULT_OFFSET_X = 3;
	const DEFAULT_OFFSET_Y = 0;
	let autoUnitName = null;
	let autoUnitCap = 0;
	// True when autoUnitName came from the global default rather than a
	// per-server choice. The overlay uses it to keep showing "(use default)",
	// so opening the gear doesn't silently pin an override onto this server.
	let autoUnitFromGlobal = false;
	let isAutoEnabled = true;
	let isDebugEnabled = false;
	let currentTribe = 'Teutons';
	let offsetX = DEFAULT_OFFSET_X;
	let offsetY = DEFAULT_OFFSET_Y;
	function log(msg, ...args) { if (isDebugEnabled) console.log(`[TLW Debug] ${msg}`, ...args); }

	// Settings (and the page scans behind tribe/server detection) are loaded on
	// first use — a report page, a loot tooltip or the calculator — not on
	// every page load.
	let settingsReady = null;
	const ensureSettings = () => (settingsReady ||= loadSettings());

	async function loadSettings() {
		const keys = Object.values(StorageKeys).map((fn) => fn());
		const globalUnitKeys = Object.keys(TROOP_DATA_REBALANCED).map((t) => GlobalKeys.autoUnit(t));
		const res = await chrome.storage.local.get([
			...keys,
			GlobalKeys.autoEnabled,
			GlobalKeys.debug,
			GlobalKeys.offsetX,
			GlobalKeys.offsetY,
			...globalUnitKeys,
		]);
		isDebugEnabled = res[StorageKeys.debug()] ?? res[GlobalKeys.debug] ?? false;
		isAutoEnabled = res[StorageKeys.autoEnabled()] ?? res[GlobalKeys.autoEnabled] ?? true;
		offsetX = res[StorageKeys.offsetX()] ?? res[GlobalKeys.offsetX] ?? DEFAULT_OFFSET_X;
		offsetY = res[StorageKeys.offsetY()] ?? res[GlobalKeys.offsetY] ?? DEFAULT_OFFSET_Y;
		applyDetectedServerType();
		const savedTribe = res[StorageKeys.tribe()];
		// Honor an explicit user choice; otherwise try to auto-detect from
		// the page and persist so the dropdown is pre-filled next time.
		// Final fallback (e.g. page has no troop graphics) is just the first
		// tribe in the active set, same as before — flagged via tribeResolved,
		// because the global default unit is keyed by tribe and guessing would
		// badge a Teuton server with Roman numbers.
		let tribeResolved = true;
		if (savedTribe && activeTroopData[savedTribe]) {
			currentTribe = savedTribe;
		} else {
			const detectedId = detectTribe();
			const detectedName = detectedId ? TRIBE_ID_TO_NAME[detectedId] : null;
			if (detectedName && activeTroopData[detectedName]) {
				currentTribe = detectedName;
				chrome.storage.local.set({ [StorageKeys.tribe()]: currentTribe });
				log('Tribe auto-detected:', currentTribe);
			} else {
				currentTribe = Object.keys(activeTroopData)[0];
				tribeResolved = false;
			}
		}
		// `||` not `??`: the popup writes '' for "(none)", which should fall
		// through to the global default rather than count as a choice.
		const globalUnit = tribeResolved ? res[GlobalKeys.autoUnit(currentTribe)] : null;
		const perServerUnit = res[StorageKeys.autoUnit()];
		const savedUnit = perServerUnit || globalUnit;
		autoUnitFromGlobal = !perServerUnit && !!globalUnit;
		if (savedUnit && UNIT_CAP_MAP.has(savedUnit)) {
			autoUnitName = savedUnit;
			autoUnitCap = UNIT_CAP_MAP.get(savedUnit);
		} else {
			// Clear, so a reload after the unit is unset drops the badges
			// instead of leaving stale ones behind.
			autoUnitName = null;
			autoUnitCap = 0;
			autoUnitFromGlobal = false;
		}
	}

	// ===== OASIS RESOURCE SCANNING =====
	function parseValueFromElement(el) {
		if (!el) return 0;
		const text = el.textContent.replace(/[^\d]/g, '');
		return text ? parseInt(text, 10) : 0;
	}
	function sumResourceWrapper(wrapper) {
		let total = 0;
		wrapper.querySelectorAll('.inlineIcon.resources').forEach((container) => {
			const iconClass = container.querySelector('i')?.className || '';
			if (!/\b(lumber|clay|iron|crop|r[1-4])\b/.test(iconClass)) return;
			total += parseValueFromElement(container.querySelector('.value'));
		});
		return total;
	}
	function extractLostResources(statsTable) {
		for (const row of statsTable.querySelectorAll('tr')) {
			const th = row.querySelector('th');
			if (!th || th.textContent.trim() !== 'Resources lost') continue;
			const cells = row.querySelectorAll('td');
			return {
				attackerLost: parseValueFromElement(cells[0]?.querySelector('.value')),
				defenderLost: parseValueFromElement(cells[1]?.querySelector('.value')),
			};
		}
		return { attackerLost: 0, defenderLost: 0 };
	}
	function createNetResourcesRow(net, defenderLost) {
		const row = document.createElement('tr');
		row.className = 'tlw-net-row';
		row.innerHTML = `
			<th>Net resources</th>
			<td><div class="inlineIcon " title=""><i class="resources_medium"></i><span class="value ">${net.toLocaleString()}</span></div></td>
			<td><div class="inlineIcon " title=""><i class="resources_medium"></i><span class="value ">${defenderLost.toLocaleString()}</span></div></td>`;
		return row;
	}
	function sumOasisResources() {
		const wrappers = document.querySelectorAll('.inlineIconList.resourceWrapper');
		if (wrappers.length === 0 || wrappers[0].dataset.tlwOasisSummed) return;
		let grandTotal = 0;
		wrappers.forEach((wrapper) => {
			wrapper.dataset.tlwOasisSummed = 'true';
			grandTotal += sumResourceWrapper(wrapper);
		});
		if (grandTotal <= 0) return;
		const totalEl = document.createElement('span');
		totalEl.className = 'tlw-oasis-sum';
		totalEl.innerHTML = `<i class="resources_small"></i> ${grandTotal.toLocaleString()}`;
		wrappers[wrappers.length - 1].after(totalEl);
		const statsTable = document.querySelector('table.combatStatistic tbody');
		if (statsTable && !statsTable.querySelector('.tlw-net-row')) {
			const { attackerLost, defenderLost } = extractLostResources(statsTable);
			statsTable.appendChild(createNetResourcesRow(grandTotal - attackerLost, defenderLost));
		}
		log('Oasis total:', grandTotal);
	}

	// ===== REPORT BADGE INJECTION =====
	function extractResourceValue(icon) {
		const sibling = icon.nextElementSibling;
		let textToParse = '';
		let targetSpan = null;
		if (sibling?.classList.contains('value')) {
			targetSpan = sibling;
			textToParse = sibling.innerText;
		} else if (icon.parentElement) {
			textToParse = icon.parentElement.innerText;
		}
		if (textToParse.includes('/')) return { value: 0, targetSpan: null };
		const cleanText = textToParse.replace(/\D/g, '');
		return { value: cleanText ? parseInt(cleanText, 10) : 0, targetSpan };
	}
	function scanForReports() {
		document.querySelectorAll('.carry').forEach((icon) => {
			if (icon.dataset.tlwProcessed) return;
			const { value, targetSpan } = extractResourceValue(icon);
			if (value > 0) {
				log('Injecting badge for value:', value);
				injectBadge(targetSpan ?? icon, value, icon);
			}
		});
	}
	function createBadgeElement(count, unitName) {
		const badge = document.createElement('span');
		badge.className = 'tlw-auto-badge';
		badge.innerHTML = `<span class="tlw-badge-count">${count}</span><span class="tlw-badge-unit">${unitName}</span>`;
		badge.style.transform = `translate(${offsetX}px, ${-(offsetY + 1)}px)`;
		return badge;
	}
	function injectBadge(anchorElement, totalResources, iconRef) {
		const count = Math.ceil(totalResources / autoUnitCap);
		const badge = createBadgeElement(count, autoUnitName);
		const isValueSpan = anchorElement.tagName === 'SPAN' && anchorElement.classList.contains('value');
		if (isValueSpan) anchorElement.appendChild(badge);
		else anchorElement.after(badge);
		if (iconRef) iconRef.dataset.tlwProcessed = 'true';
	}
	function updateBadgesPosition() {
		const transform = `translate(${offsetX}px, ${-(offsetY + 1)}px)`;
		document.querySelectorAll('.tlw-auto-badge').forEach((b) => (b.style.transform = transform));
	}
	function refreshAllBadges() {
		document
			.querySelectorAll('.tlw-auto-badge, .tlw-oasis-sum, .tlw-net-row, .tlw-tip-line')
			.forEach((el) => el.remove());
		document.querySelectorAll('.carry[data-tlw-processed]').forEach((el) => delete el.dataset.tlwProcessed);
		document.querySelectorAll('[data-tlw-oasis-summed]').forEach((el) => delete el.dataset.tlwOasisSummed);
		if (active && isAutoEnabled && autoUnitCap > 0) scanForReports();
	}
	function scanReportPage() {
		if (!active) return;
		if (!window.location.href.includes('/report')) return;
		sumOasisResources();
		if (isAutoEnabled && autoUnitCap > 0) scanForReports();
	}

	// ===== TIPPY TOOLTIP INJECTION =====
	function findNextTextNode(startNode) {
		let node = startNode.nextSibling;
		while (node) {
			if (node.nodeType === Node.TEXT_NODE) return node;
			node = node.nextSibling;
		}
		return startNode;
	}
	function extractTippyResources(carryImg) {
		const textNode = findNextTextNode(carryImg);
		if (textNode === carryImg) return 0;
		const cleaned = textNode.textContent
			.replace(/[‪‫‬‎‏‭‮]/g, '')
			.trim();
		const digits = cleaned.split('/')[0].replace(/[^\d]/g, '');
		return parseInt(digits, 10) || 0;
	}
	function injectTippyUnitCount(tippyRoot) {
		if (!active) return;
		if (autoUnitCap <= 0 || !autoUnitName) return;
		if (tippyRoot.style.visibility !== 'visible') return;
		const content = tippyRoot.querySelector('.tippy-content');
		if (!content) return;
		const carryImg = content.querySelector('img.carry');
		if (!carryImg) return;
		const resources = extractTippyResources(carryImg);
		if (resources <= 0) return;
		if (content.querySelector('.tlw-tip-line')) return;
		const count = Math.ceil(resources / autoUnitCap);
		const badge = document.createElement('span');
		badge.className = 'tlw-tip-line';
		badge.textContent = ` → ${count} ${autoUnitName}`;
		findNextTextNode(carryImg).after(badge);
		log('Tippy injection:', count, autoUnitName, 'for', resources, 'res');
	}
	// Each tippy root gets its own style observer the first time it is seen;
	// no document-wide attribute observer.
	const pendingRoots = new Map();
	const watchedRoots = new WeakSet();
	function scheduleInject(root) {
		clearTimeout(pendingRoots.get(root));
		pendingRoots.set(
			root,
			setTimeout(() => {
				pendingRoots.delete(root);
				if (active && root.style.visibility === 'visible') injectTippyUnitCount(root);
			}, TIPPY_INJECT_DELAY_MS),
		);
	}
	function watchTippy(root) {
		scheduleInject(root);
		if (watchedRoots.has(root)) return;
		watchedRoots.add(root);
		new MutationObserver(() => {
			if (active && root.style.visibility === 'visible') scheduleInject(root);
		}).observe(root, { attributes: true, attributeFilter: ['style'] });
	}

	// ===== UTILITIES =====
	function parseResources(text) {
		if (!text || text.includes('/')) return 0;
		const clean = text.replace(/[,.]/g, '').trim();
		const parts = clean.split(/[\s|]+/).map((num) => parseInt(num, 10));
		const numbers = parts.filter((n) => !isNaN(n) && n > 0);
		return numbers.length > 0 ? numbers[numbers.length - 1] : 0;
	}
	function makeDraggable(el, handle) {
		let isDragging = false;
		let startX, startY, initialLeft, initialTop;
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			isDragging = true;
			const rect = el.getBoundingClientRect();
			el.style.transform = 'none';
			el.style.left = rect.left + 'px';
			el.style.top = rect.top + 'px';
			el.style.bottom = 'auto';
			el.style.right = 'auto';
			startX = e.clientX;
			startY = e.clientY;
			initialLeft = rect.left;
			initialTop = rect.top;
			handle.style.cursor = 'grabbing';
			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);
		});
		function onMouseMove(e) {
			if (!isDragging) return;
			el.style.left = `${initialLeft + (e.clientX - startX)}px`;
			el.style.top = `${initialTop + (e.clientY - startY)}px`;
		}
		function onMouseUp() {
			isDragging = false;
			handle.style.cursor = 'move';
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}
	}
	function createCheckboxRow(id, label, isChecked) {
		const row = document.createElement('div');
		row.className = 'tlw-group tlw-group--start';
		row.innerHTML = `<input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}><label for="${id}" class="tlw-chk-label">${label}</label>`;
		return row;
	}
	function createTribeSelectOptions() {
		return Object.keys(activeTroopData)
			.map((tribe) => `<option value="${tribe}" ${tribe === currentTribe ? 'selected' : ''}>${tribe}</option>`)
			.join('');
	}
	function createDebouncer() {
		let timeout = null;
		return (callback) => {
			clearTimeout(timeout);
			timeout = setTimeout(callback, STORAGE_SAVE_DELAY_MS);
		};
	}

	// ===== OVERLAY =====
	function buildCalcView(totalRes, selectionText) {
		const view = document.createElement('div');
		view.id = 'tlw-view-calc';
		const resRow = document.createElement('div');
		resRow.className = 'tlw-group';
		resRow.innerHTML = `<label>Resources:</label><input type="number" id="tlw-res-input" value="${totalRes}">`;
		const tribeRow = document.createElement('div');
		tribeRow.className = 'tlw-group';
		tribeRow.innerHTML = `<label>My Tribe:</label><select id="tlw-tribe-select">${createTribeSelectOptions()}</select>`;
		const unitContainer = document.createElement('div');
		unitContainer.className = 'tlw-units';
		const resultContainer = document.createElement('div');
		resultContainer.className = 'tlw-results';
		const debugRow = document.createElement('div');
		debugRow.id = 'tlw-debug-row';
		debugRow.className = 'tlw-debug-row';
		debugRow.innerText = `Raw: "${selectionText}"`;
		debugRow.style.display = isDebugEnabled ? 'block' : 'none';
		view.append(resRow, tribeRow, document.createElement('hr'), unitContainer, document.createElement('hr'), resultContainer, debugRow);
		return view;
	}
	function buildSettingsView() {
		const view = document.createElement('div');
		view.id = 'tlw-view-settings';
		view.style.display = 'none';
		view.innerHTML = `<div class="tlw-settings-title">Settings (${serverID})</div>`;
		const posRow = document.createElement('div');
		posRow.className = 'tlw-group';
		posRow.innerHTML = `
			<label>Pos Offset (X/Y):</label>
			<div class="tlw-pos-inputs">
				<input type="number" id="tlw-off-x" value="${offsetX}" placeholder="X">
				<input type="number" id="tlw-off-y" value="${offsetY}" placeholder="Y">
			</div>
		`;
		const defUnitRow = document.createElement('div');
		defUnitRow.className = 'tlw-group';
		defUnitRow.innerHTML = `<label>Default Unit:</label><select id="tlw-auto-unit"></select>`;
		const doneBtn = document.createElement('button');
		doneBtn.className = 'tlw-btn-save';
		doneBtn.innerText = 'Done';
		view.append(
			createCheckboxRow('tlw-auto-chk', 'Show on Reports', isAutoEnabled),
			createCheckboxRow('tlw-debug-chk', 'Enable Debug Mode', isDebugEnabled),
			defUnitRow,
			posRow,
			document.createElement('br'),
			doneBtn,
		);
		return view;
	}
	function populateAutoUnit(selectEl, tribe) {
		selectEl.innerHTML = '';
		// Leading "unset" entry: without it, a saved unit from another tribe
		// matches nothing, the browser selects the first unit instead, and the
		// next settings change silently overwrites the saved default.
		const useDefault = document.createElement('option');
		useDefault.value = '';
		useDefault.innerText = autoUnitFromGlobal ? `(use default: ${autoUnitName})` : '(use default)';
		selectEl.appendChild(useDefault);
		let matched = false;
		activeTroopData[tribe].forEach((u) => {
			const opt = document.createElement('option');
			opt.value = u.name;
			opt.innerText = `${u.name} (${u.cap})`;
			// When the unit is only inherited, leave "(use default)" selected so
			// saving here doesn't convert it into a per-server override.
			if (!autoUnitFromGlobal && u.name === autoUnitName) {
				opt.selected = true;
				matched = true;
			}
			selectEl.appendChild(opt);
		});
		if (!matched) useDefault.selected = true;
	}
	function shouldCheckByDefault(unitName, lastUnits, tribe) {
		if (lastUnits.includes(unitName)) return true;
		const hasValidLastUnits = lastUnits.some((saved) => activeTroopData[tribe].find((u) => u.name === saved));
		return !hasValidLastUnits;
	}
	function renderUnits(unitContainer, tribe, onCalculate) {
		unitContainer.innerHTML = '<div class="tlw-units-heading">Select Units:</div>';
		chrome.storage.local.get([StorageKeys.lastUnits()]).then((res) => {
			const lastUnits = res[StorageKeys.lastUnits()] ?? [];
			activeTroopData[tribe].forEach((unit) => {
				const label = document.createElement('label');
				label.className = 'tlw-unit-row';
				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.value = unit.name;
				checkbox.dataset.cap = unit.cap;
				checkbox.checked = shouldCheckByDefault(unit.name, lastUnits, tribe);
				checkbox.onchange = () => {
					const checked = Array.from(unitContainer.querySelectorAll('input:checked')).map((input) => input.value);
					chrome.storage.local.set({ [StorageKeys.lastUnits()]: checked });
					onCalculate();
				};
				label.append(checkbox, ` ${unit.name} (${unit.cap})`);
				unitContainer.appendChild(label);
			});
			onCalculate();
		});
	}
	function calculate(resInput, unitContainer, resultContainer) {
		const amount = parseInt(resInput.value) || 0;
		resultContainer.innerHTML = '';
		const checks = Array.from(unitContainer.querySelectorAll('input:checked'));
		if (checks.length === 0) {
			resultContainer.innerHTML = '<div class="tlw-empty">Select units</div>';
			return;
		}
		const table = document.createElement('table');
		table.className = 'tlw-table';
		const thead = document.createElement('tr');
		thead.innerHTML = `<th>Unit</th><th>Need</th>`;
		table.appendChild(thead);
		let totalCap = 0;
		const fragment = document.createDocumentFragment();
		checks.forEach((c) => {
			const cap = parseInt(c.dataset.cap);
			totalCap += cap;
			const row = document.createElement('tr');
			row.innerHTML = `<td>${c.value}</td><td class="tlw-result-count">${Math.ceil(amount / cap)}</td>`;
			fragment.appendChild(row);
		});
		if (checks.length > 1) {
			const mixedEach = Math.ceil(amount / totalCap);
			const mixedRow = document.createElement('tr');
			mixedRow.className = 'tlw-mixed-row';
			mixedRow.innerHTML = `
				<td><strong>Mixed (1:1)</strong></td>
				<td class="tlw-mixed-count">${mixedEach} ea <span class="tlw-mixed-total">(${mixedEach * checks.length})</span></td>
			`;
			fragment.appendChild(mixedRow);
		}
		table.appendChild(fragment);
		resultContainer.appendChild(table);
	}
	function buildSettingsObject(enabled, debugOn, unitName, offX, offY) {
		return {
			[StorageKeys.autoEnabled()]: enabled,
			[StorageKeys.debug()]: debugOn,
			[StorageKeys.autoUnit()]: unitName,
			[StorageKeys.offsetX()]: offX,
			[StorageKeys.offsetY()]: offY,
		};
	}
	function wireOverlayEvents(els) {
		const { overlay, calcView, settingsView, settingsIcon, closeIcon, resInput, tribeSelect, autoUnitSelect, unitContainer, resultContainer, offXInput, offYInput, autoChk, debugChk, doneBtn } = els;
		const doCalc = () => calculate(resInput, unitContainer, resultContainer);
		const debouncedSave = createDebouncer();
		closeIcon.onclick = () => overlay.remove();
		resInput.oninput = doCalc;
		doneBtn.onclick = () => settingsIcon.click();
		settingsIcon.onclick = () => {
			const isShowingCalc = calcView.style.display !== 'none';
			calcView.style.display = isShowingCalc ? 'none' : 'block';
			settingsView.style.display = isShowingCalc ? 'block' : 'none';
			if (isShowingCalc) populateAutoUnit(autoUnitSelect, tribeSelect.value);
		};
		tribeSelect.onchange = () => {
			currentTribe = tribeSelect.value;
			chrome.storage.local.set({ [StorageKeys.tribe()]: currentTribe });
			renderUnits(unitContainer, currentTribe, doCalc);
			doCalc();
		};
		const applySettings = (shouldDebounce = false) => {
			const enabled = autoChk.checked;
			const debugOn = debugChk.checked;
			const unitName = autoUnitSelect.value;
			const newOffsetX = parseInt(offXInput.value, 10) || 0;
			const newOffsetY = parseInt(offYInput.value, 10) || 0;
			const saveObj = buildSettingsObject(enabled, debugOn, unitName, newOffsetX, newOffsetY);
			if (shouldDebounce) debouncedSave(() => chrome.storage.local.set(saveObj));
			else chrome.storage.local.set(saveObj);
			isAutoEnabled = enabled;
			isDebugEnabled = debugOn;
			// '' means "use the global default"; the storage listener reloads
			// settings and resolves it, so leave the live value alone here.
			if (unitName) autoUnitName = unitName;
			if (offsetX !== newOffsetX || offsetY !== newOffsetY) {
				offsetX = newOffsetX;
				offsetY = newOffsetY;
				updateBadgesPosition();
			}
			const newCap = UNIT_CAP_MAP.get(unitName);
			if (newCap && autoUnitCap !== newCap) {
				autoUnitCap = newCap;
				refreshAllBadges();
			}
			const dbg = document.getElementById('tlw-debug-row');
			if (dbg) dbg.style.display = isDebugEnabled ? 'block' : 'none';
			if (!enabled) refreshAllBadges();
			else scanForReports();
		};
		offXInput.oninput = () => applySettings(true);
		offYInput.oninput = () => applySettings(true);
		autoChk.onchange = () => applySettings(false);
		debugChk.onchange = () => applySettings(false);
		autoUnitSelect.onchange = () => applySettings(false);
	}
	function createOverlay(selectionText) {
		const existing = document.getElementById('tlw-overlay');
		if (existing) existing.remove();
		const totalRes = parseResources(selectionText);
		const overlay = document.createElement('div');
		overlay.id = 'tlw-overlay';
		const header = document.createElement('div');
		header.className = 'tlw-header';
		header.innerHTML = `<span>Loot Wizard</span><div class="tlw-header-actions"><span class="tlw-btn-icon">⚙️</span><span class="tlw-close">&times;</span></div>`;
		const body = document.createElement('div');
		body.className = 'tlw-body';
		const calcView = buildCalcView(totalRes, selectionText);
		const settingsView = buildSettingsView();
		body.append(calcView, settingsView);
		overlay.append(header, body);
		document.body.appendChild(overlay);
		makeDraggable(overlay, header);
		const els = {
			overlay,
			calcView,
			settingsView,
			settingsIcon: header.querySelector('.tlw-btn-icon'),
			closeIcon: header.querySelector('.tlw-close'),
			resInput: document.getElementById('tlw-res-input'),
			tribeSelect: document.getElementById('tlw-tribe-select'),
			autoUnitSelect: document.getElementById('tlw-auto-unit'),
			unitContainer: calcView.querySelector('.tlw-units'),
			resultContainer: calcView.querySelector('.tlw-results'),
			offXInput: document.getElementById('tlw-off-x'),
			offYInput: document.getElementById('tlw-off-y'),
			autoChk: document.getElementById('tlw-auto-chk'),
			debugChk: document.getElementById('tlw-debug-chk'),
			doneBtn: settingsView.querySelector('.tlw-btn-save'),
		};
		wireOverlayEvents(els);
		const doCalc = () => calculate(els.resInput, els.unitContainer, els.resultContainer);
		renderUnits(els.unitContainer, currentTribe, doCalc);
	}

	window.TravianQoL.register({
		id: 'loot-calc',
		label: 'Loot Calculator',
		description: 'Right-click selected resource text → "Calculate Troops Needed" opens an in-page calculator. On reports, adds a small unit-count badge next to every loot value.',
		init() {
			active = true;
			const onReport = () => window.location.href.includes('/report');
			if (onReport()) ensureSettings().then(scanReportPage);

			// One body observer: loot tooltips (any page) and report re-renders
			// (list filters etc., report pages only).
			let scanTimeout = null;
			observer = new MutationObserver((mutations) => {
				if (!active) return;
				for (const m of mutations) {
					for (const node of m.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-tippy-root')) {
							ensureSettings().then(() => watchTippy(node));
						}
					}
				}
				if (scanTimeout || !onReport()) return;
				scanTimeout = setTimeout(() => {
					scanTimeout = null;
					ensureSettings().then(scanReportPage);
				}, DEBOUNCE_DELAY_MS);
			});
			observer.observe(document.body, { childList: true, subtree: true });

			messageHandler = (msg) => {
				if (!active) return;
				if (msg && msg.type === 'OPEN_CALCULATOR') ensureSettings().then(() => createOverlay(msg.selection));
			};
			chrome.runtime.onMessage.addListener(messageHandler);

			// Pick up edits made in the QoL popup without a page reload.
			storageHandler = (changes, area) => {
				if (!active || area !== 'local') return;
				const relevant = Object.keys(changes).some(
					(k) => k.startsWith('tlw_') && !k.startsWith('tlw_last_units_'),
				);
				if (!relevant || !settingsReady) return;
				(settingsReady = loadSettings()).then(() => {
					updateBadgesPosition();
					refreshAllBadges();
					scanReportPage();
				});
			};
			chrome.storage.onChanged.addListener(storageHandler);
		},
		destroy() {
			active = false;
			observer?.disconnect();
			observer = null;
			if (messageHandler) {
				chrome.runtime.onMessage.removeListener(messageHandler);
				messageHandler = null;
			}
			if (storageHandler) {
				chrome.storage.onChanged.removeListener(storageHandler);
				storageHandler = null;
			}
			const overlay = document.getElementById('tlw-overlay');
			if (overlay) overlay.remove();
			refreshAllBadges();
		},
	});
})();
