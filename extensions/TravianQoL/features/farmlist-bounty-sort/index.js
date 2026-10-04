// Farm-list bounty sort.
// When the user picks "By bounty" from Travian's sort menu, we enter a
// persistent "bounty mode" that sorts every farm list on the page by:
//   * Last raid bounty, DESCENDING (most profitable targets first).
//   * Distance from the sending village, ASCENDING, as a tie-breaker.
//
// Mode persistence is important because Travian's React tree re-renders the
// slot rows in response to all sorts of unrelated actions (opening a context
// menu, navigating between lists, periodic refreshes) and each re-render
// reverts row order back to React's own state. A single sort-on-click is not
// enough — we install a MutationObserver per tbody that re-applies the sort
// whenever the rows reorder, for as long as bounty mode is active. Picking
// any other sort (a column header, a non-bounty option in the lastRaid
// menu) turns the mode off. The active flag is stored in chrome.storage.local
// so it survives page navigation within the same Chrome profile.
//
// Compliance note: we only reorder existing <tr> elements inside the page's
// own table. No raids are sent, no events are dispatched to game endpoints,
// no timers run. Equivalent to the user clicking column headers manually.
(function () {
	const STATE_KEY = 'travianQoL.bountySort.active';
	let active = false;
	let applying = false; // re-entry guard for our own appendChild calls
	let clickHandler = null;
	let storageListener = null;
	let rootObserver = null; // single subtree observer that survives re-renders
	let resortTimer = null;

	function parseNum(text) {
		if (!text) return NaN;
		// Strip Travian's invisible bidi markers and any non-numeric formatting
		// (commas, dots used as thousands separators) so we can compare as ints.
		const cleaned = String(text).replace(/[‪-‮⁦-⁩​-‏]/g, '').replace(/[^\d.-]/g, '');
		return cleaned ? parseFloat(cleaned) : NaN;
	}

	function readRow(slot) {
		const bounty = parseNum(slot.querySelector('.lastRaidBounty .value')?.textContent);
		// The .distance cell holds the number in a plain <span> with no class,
		// not a .value span like the bounty cells do. Read the cell text
		// directly to stay robust to either layout.
		const distance = parseNum(
			slot.querySelector('.distance .value')?.textContent ??
				slot.querySelector('.distance')?.textContent,
		);
		return { bounty, distance };
	}

	function sortTable(table) {
		const tbody = table.querySelector('tbody');
		if (!tbody) return;
		const rows = [...tbody.querySelectorAll(':scope > tr.slot')];
		if (rows.length < 2) return;
		const rowData = rows.map((row) => ({ row, ...readRow(row) }));
		// Quick check: if the rows are already in the desired order, skip the
		// appendChild loop entirely. Avoids triggering our own observer.
		const sorted = rowData.slice().sort((a, b) => {
			const aB = Number.isFinite(a.bounty) ? a.bounty : -Infinity;
			const bB = Number.isFinite(b.bounty) ? b.bounty : -Infinity;
			if (aB !== bB) return bB - aB;
			const aD = Number.isFinite(a.distance) ? a.distance : Infinity;
			const bD = Number.isFinite(b.distance) ? b.distance : Infinity;
			return aD - bD;
		});
		const identical = sorted.every((s, i) => s.row === rowData[i].row);
		if (identical) return;
		for (const { row } of sorted) tbody.appendChild(row);
		// The "Add target" row and any other non-.slot trailing row belong
		// at the very bottom of the list — our loop above would otherwise
		// push them above the sorted slots.
		const trailing = tbody.querySelectorAll(':scope > tr:not(.slot)');
		for (const t of trailing) tbody.appendChild(t);
	}

	function sortNow() {
		if (applying) return;
		applying = true;
		try {
			for (const t of document.querySelectorAll('table.slots')) sortTable(t);
		} finally {
			applying = false;
		}
	}

	function sortAll() {
		sortNow();
		startRootObserver();
	}

	function startRootObserver() {
		if (rootObserver) return;
		// Watch ONE stable ancestor for the whole subtree instead of binding to
		// each <tbody>. Travian's React tree frequently REPLACES the table/tbody
		// (periodic farm-list refresh, returning raids, village switch, …); a
		// per-tbody observer is left watching a detached node and silently dies,
		// so the order reverts to native until the user re-picks the sort. A
		// subtree observer on a node that outlives those re-renders keeps working.
		//
		// Scope the root to the farm-list panel, NOT document.body: other
		// extensions on the page (e.g. an alarm widget that rebuilds itself a few
		// times a second) fire a constant stream of unrelated childList mutations
		// that would perpetually reset our debounce and starve the re-sort. The
		// rally-point panel only mutates when the farm lists themselves change.
		const root =
			document.querySelector('.buildRallyPointFarmList') ||
			document.getElementById('content') ||
			document.body;
		if (!root) return;
		rootObserver = new MutationObserver(() => {
			if (!active || applying) return;
			// Debounce so we sort the FINAL post-render order (and coalesce the
			// burst of mutations a single re-render produces) rather than an
			// intermediate one. sortTable() early-returns when already sorted, so
			// mutations caused by our own appendChild converge without looping.
			clearTimeout(resortTimer);
			resortTimer = setTimeout(() => {
				if (active && !applying) sortNow();
			}, 120);
		});
		rootObserver.observe(root, { childList: true, subtree: true });
	}

	function setActive(value) {
		if (active === value) return;
		active = value;
		chrome.storage.local.set({ [STATE_KEY]: value });
		if (value) sortAll();
	}

	// True for the exact "Bounty" (last-raid bounty) sort — NOT "Total bounty"
	// or "Average bounty", which are separate options that must not activate us.
	function isBountyText(text) {
		return /\bbounty\b/.test(text) && !/total|average|sum/.test(text);
	}

	function classifySortClick(ev) {
		// Returns 'bounty' if the click activates bounty sort, 'other' if it
		// activates any other sort (which should turn bounty mode off), or
		// null if the click is unrelated to sorting.
		// 1) A click on a sortable column header → some other sort is active.
		const sortableTh = ev.target.closest('th.sortable');
		if (sortableTh) return 'other';
		// 2) A click on an option inside Travian's lastRaid sort menu. The menu
		//    is portalled out to `.contextMenuWrapper > .contextMenu.sorting`
		//    with one anchor per option (a.bounty, a.combatResult, a.lastRaid,
		//    a.totalBounty, a.nextAttack, …). Exactly one of them — the
		//    last-raid "Bounty" pick — turns bounty mode on; EVERY other option
		//    turns it off. The previous keyword allow-list silently missed
		//    "Combat result", "Next attack" and "Total bounty", which left
		//    bounty mode stuck on and fighting the user's actual choice.
		const option = ev.target.closest(
			'.contextMenu.sorting a, .contextMenuWrapper .contextMenu a',
		);
		if (option) {
			const text = (option.textContent || '').trim().toLowerCase();
			return option.matches('a.bounty') || isBountyText(text) ? 'bounty' : 'other';
		}
		// 3) Fallback for other skins/layouts: text-based detection within any
		//    menu-shaped container. (The .sorting link inside th.lastRaid that
		//    merely opens the menu has no text, so it correctly yields null.)
		const candidate = ev.target.closest('a, button, li, [role="menuitem"], [class*="dropdown"] *, [class*="menu"] *');
		if (!candidate) return null;
		const text = (candidate.textContent || '').toLowerCase();
		if (!text) return null;
		if (isBountyText(text)) return 'bounty';
		if (candidate.closest('.contextMenuWrapper, [class*="contextMenu" i], [class*="dropdown" i], [class*="menu" i]')) {
			if (/(sort|time|raid|name|population|distance|troops|combat|attack|result|bounty)/.test(text)) return 'other';
		}
		return null;
	}

	function onClick(ev) {
		const kind = classifySortClick(ev);
		if (kind === 'bounty') setActive(true);
		else if (kind === 'other') setActive(false);
	}

	window.TravianQoL.register({
		id: 'farmlist-bounty-sort',
		label: 'Farm list bounty sort',
		description: 'When "By bounty" is selected, keeps targets sorted by last bounty descending with distance ascending as a tie-breaker — persistent across page re-renders until another sort is chosen.',
		init() {
			// Page-scope guard: only run on the farm list page.
			const url = location.pathname + location.search;
			const onFarmListUrl = /build\.php/.test(url) && /\btt=99\b/.test(url);
			const hasFarmListDom = document.querySelector('.farmListWrapper, .raidList, [class*="raidList"], [class*="farmList"]') !== null;
			if (!onFarmListUrl && !hasFarmListDom) return;

			if (clickHandler) return;
			clickHandler = onClick;
			document.addEventListener('click', clickHandler, true);

			// Restore the persisted active state and start observing/sorting.
			// Start the re-render observer either way so an activation later in
			// the session is honoured even if the lists were empty at load.
			chrome.storage.local.get([STATE_KEY], (res) => {
				active = !!res[STATE_KEY];
				if (active) sortAll();
				else startRootObserver();
			});

			// Watch for the flag changing in another tab (or via options).
			storageListener = (changes, area) => {
				if (area !== 'local' || !changes[STATE_KEY]) return;
				active = !!changes[STATE_KEY].newValue;
				if (active) sortAll();
			};
			chrome.storage.onChanged.addListener(storageListener);
		},
		destroy() {
			if (clickHandler) {
				document.removeEventListener('click', clickHandler, true);
				clickHandler = null;
			}
			if (storageListener) {
				chrome.storage.onChanged.removeListener(storageListener);
				storageListener = null;
			}
			if (rootObserver) {
				rootObserver.disconnect();
				rootObserver = null;
			}
			clearTimeout(resortTimer);
			resortTimer = null;
			active = false;
		},
	});
})();
