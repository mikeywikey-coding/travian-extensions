// Farm-list multi-select.
// On the in-game farm list page each target row has a checkbox the user can
// tick to include it in the next send. Native UI only supports clicking one
// box at a time. This feature adds:
//   * Shift-click  — set every checkbox between the last-clicked one and this
//                    one to the new state (range select, like file managers).
//   * Ctrl/Cmd-click — toggles the row's checkbox even if the click landed on
//                      the row body rather than the box itself.
//
// Compliance note: this only mutates the checked state of *existing* native
// checkboxes in response to a real user click. No raids are sent, no events
// are dispatched to game endpoints, no timers run. It is purely a selection
// helper — semantically identical to the user clicking each box themselves.
(function () {
	// Per-list state: last checkbox the user clicked, so shift-click knows the
	// range anchor. Keyed by the list container element.
	const anchors = new WeakMap();
	let clickHandler = null;
	let mousedownHandler = null;
	let contextmenuHandler = null;
	let dismissHandler = null;
	let keydownHandler = null;
	let scrollHandler = null;
	let styleEl = null;
	let menuEl = null;

	// Tiny stylesheet that lightens any row containing a checked target box,
	// so the current multi-selection is visible at a glance. :has() is used
	// to scope the highlight to rows with a ticked checkbox; supported in
	// Chrome 105+ which Travian's site already requires.
	// The earlier rgba() rule appeared to work because it was translucent — even
	// with cell backgrounds painting over the <tr>, the tint bled through. An
	// opaque hex on the <tr> alone gets fully hidden by the <td> backgrounds.
	// Paint the cells directly so the opaque colour actually shows.
	const HIGHLIGHT_CSS = `
		tr:has(input[type="checkbox"]:checked),
		tr:has(input[type="checkbox"]:checked) > td,
		tr:has(input[type="checkbox"]:checked) > th,
		[class*="slotRow"]:has(input[type="checkbox"]:checked),
		[class*="slotRow"]:has(input[type="checkbox"]:checked) > *,
		[class*="raidListEntry"]:has(input[type="checkbox"]:checked),
		[class*="raidListEntry"]:has(input[type="checkbox"]:checked) > * {
			background-color: #4e505c !important;
		}
	`;
	const MENU_CSS = `
		._tqfl-menu { position: fixed; z-index: 2147483647; min-width: 210px; padding: 4px; border: 1px solid #777; border-radius: 4px; background: #262832; box-shadow: 0 4px 14px #0009; }
		._tqfl-menu[hidden] { display: none; }
		._tqfl-menu button { display: block; width: 100%; padding: 8px 12px; border: 0; border-radius: 2px; background: transparent; color: #f4f4f6; text-align: left; cursor: pointer; }
		._tqfl-menu button:hover, ._tqfl-menu button:focus { background: #4e505c; outline: none; }
	`;

	// Selector for any farm list container on the page. Used both to find the
	// list a click landed in and to detect clicks that landed *outside* every
	// list (which clear the selection).
	const LIST_SELECTOR = 'table, .raidList, .farmList, [class*="raidList"], [class*="farmList"]';

	function getCheckboxes(list) {
		// All target checkboxes in DOM order within this list.
		return Array.from(list.querySelectorAll('input[type="checkbox"]')).filter(
			// Skip the "select all" master checkbox in the list header.
			(cb) => !cb.closest('thead'),
		);
	}

	function findList(el) {
		// Each farm list is rendered as a <table> (legacy) or a container with
		// class containing "raidList" / "farmList" (newer React UI). Walk up
		// until we find something that groups multiple target checkboxes.
		return el.closest(LIST_SELECTOR);
	}

	function clearAllSelections() {
		// Uncheck every target checkbox inside every farm list on the page.
		// Header "select all" boxes are skipped by reusing getCheckboxes().
		for (const list of document.querySelectorAll(LIST_SELECTOR)) {
			for (const cb of getCheckboxes(list)) setChecked(cb, false);
		}
	}

	function setChecked(cb, value) {
		if (cb.checked === value) return;
		// Travian's farm list is React-rendered. Setting cb.checked directly
		// bypasses React's value tracker — the box looks ticked, but on the
		// next re-render (e.g. opening the bulk-action context menu) React
		// reverts it to its own state of "not selected". Firing a real
		// click() goes through the native event path, which React picks up
		// via its delegated change handler and updates state from. Result:
		// our shift/ctrl-selection sticks across re-renders.
		cb.click();
	}

	function selectedTargetLinks(list) {
		const urls = [];
		for (const checkbox of getCheckboxes(list)) {
			if (!checkbox.checked) continue;
			const row = checkbox.closest('tr, [class*="slotRow"], [class*="raidListEntry"]');
			const link = row?.querySelector('td.target a[href*="karte.php"], a[href*="karte.php"]');
			if (!link) continue;
			try {
				const url = new URL(link.href, location.href);
				if (url.origin === location.origin && url.pathname === '/karte.php') urls.push(url.href);
			} catch { /* malformed target link */ }
		}
		return [...new Set(urls)];
	}

	function hideMenu() {
		if (menuEl) menuEl.hidden = true;
	}

	function showMenu(ev, list) {
		const urls = selectedTargetLinks(list);
		if (!urls.length) return hideMenu();
		if (!menuEl) {
			menuEl = document.createElement('div');
			menuEl.className = '_tqfl-menu';
			menuEl.setAttribute('role', 'menu');
			const action = document.createElement('button');
			action.type = 'button';
			action.setAttribute('role', 'menuitem');
			action.addEventListener('click', () => {
				const currentList = menuEl._list;
				const currentUrls = currentList && selectedTargetLinks(currentList);
				hideMenu();
				if (currentUrls?.length) chrome.runtime.sendMessage({ action: 'qol_open_tabs', urls: currentUrls });
			});
			menuEl.appendChild(action);
			document.body.appendChild(menuEl);
		}
		menuEl._list = list;
		const action = menuEl.querySelector('button');
		action.textContent = `Open ${urls.length} selected target${urls.length === 1 ? '' : 's'} in tabs`;
		menuEl.hidden = false;
		const rect = menuEl.getBoundingClientRect();
		menuEl.style.left = `${Math.max(8, Math.min(ev.clientX, window.innerWidth - rect.width - 8))}px`;
		menuEl.style.top = `${Math.max(8, Math.min(ev.clientY, window.innerHeight - rect.height - 8))}px`;
		action.focus();
	}

	function onClick(ev) {
		// Click outside every farm list: clear all current selections and bail.
		// This matches the "click off to deselect" mental model from file
		// managers. Important exemption: context menus, popovers and dialogs
		// usually portal themselves to <body> so they read as "outside" the
		// list DOM even though they're conceptually part of the list flow.
		// Treat clicks inside those overlays — and on any button/link that
		// might have opened one — as "still inside the selection context".
		const insideList = ev.target.closest(LIST_SELECTOR);
		const insideOverlay = ev.target.closest(
			'.contextMenu, [class*="contextMenu" i], [class*="popover" i], [class*="dropdown" i], [class*="dialog" i], [class*="overlay" i], [role="menu"], [role="dialog"]',
		);
		const onActionEl = ev.target.closest('button, a[role="button"], a.openContextMenu, .openContextMenu');
		if (!insideList && !insideOverlay && !onActionEl) {
			clearAllSelections();
			return;
		}
		// Always let interactive controls inside the list keep their native
		// behaviour: target-name links, action icons, sort buttons in the
		// header, the sort menu dropdown, etc. Without this, our row-level
		// preventDefault would swallow their clicks.
		if (ev.target.closest('a, button, select, summary, [role="button"], [role="menuitem"]')) return;
		// Header rows (sort controls) live in <thead>; never treat them as a
		// target row even if a click slips through to a <tr>.
		if (ev.target.closest('thead')) return;

		// We only care about clicks that landed inside a row that has a checkbox.
		const row = ev.target.closest('tr, [class*="slotRow"], [class*="raidListEntry"]');
		if (!row) return;
		const list = findList(row);
		if (!list) return;
		const checkbox = row.querySelector('input[type="checkbox"]');
		if (!checkbox) return;

		const shift = ev.shiftKey;
		const toggle = ev.ctrlKey || ev.metaKey;
		if (!shift && !toggle) {
			// Plain click on a target — leave existing selections alone and
			// just remember this row as the anchor so a later shift-click can
			// build a range from here. Selection is only cleared by clicking
			// completely outside any farm list (handled above).
			anchors.set(list, checkbox);
			return;
		}

		// Suppress the native click so the checkbox state we set below sticks
		// instead of being flipped again by the browser's default toggle.
		ev.preventDefault();
		ev.stopPropagation();

		const boxes = getCheckboxes(list);
		const anchor = anchors.get(list);

		if (shift && anchor && boxes.includes(anchor) && anchor !== checkbox) {
			const a = boxes.indexOf(anchor);
			const b = boxes.indexOf(checkbox);
			const [lo, hi] = a < b ? [a, b] : [b, a];
			// Range gets set to the *opposite* of the anchor's current state so
			// shift-click on an already-checked anchor unchecks the range, which
			// matches the mental model of "extend the selection from there".
			const value = !anchor.checked;
			for (let i = lo; i <= hi; i++) setChecked(boxes[i], value);
		} else {
			// Ctrl/Cmd-click, or shift-click without a valid anchor — toggle this row.
			setChecked(checkbox, !checkbox.checked);
		}
		anchors.set(list, checkbox);
	}

	window.TravianQoL.register({
		id: 'farmlist-multi-select',
		label: 'Farm list multi-select',
		description: 'Shift-click to select a range, Ctrl/Cmd-click to toggle targets, and right-click a checked row to open selected targets in tabs.',
		init() {
			// Only attach on the farm list page. Travian's raid list lives at
			// build.php?gid=16&tt=99 (rally point → "Send farm list" tab). We
			// check both the URL and the presence of a raid-list container so
			// the feature stays inert on reports, the map, the village, etc.
			// — previously, hijacking row clicks site-wide was blocking the
			// reports page from opening individual reports.
			const url = location.pathname + location.search;
			const onFarmListUrl = /build\.php/.test(url) && /\btt=99\b/.test(url);
			const hasFarmListDom = document.querySelector('.raidList, [class*="raidList"], [class*="farmList"]') !== null;
			if (!onFarmListUrl && !hasFarmListDom) return;

			if (clickHandler) return;
			clickHandler = onClick;
			// Capture phase so we see the click before Travian's own handlers and
			// can preventDefault on the native checkbox toggle.
			document.addEventListener('click', clickHandler, true);

			contextmenuHandler = (ev) => {
				const row = ev.target.closest('tr, [class*="slotRow"], [class*="raidListEntry"]');
				const list = row && findList(row);
				const checkbox = row?.querySelector('input[type="checkbox"]');
				if (!list || !checkbox?.checked) return hideMenu();
				const urls = selectedTargetLinks(list);
				if (!urls.length) return hideMenu();
				ev.preventDefault();
				showMenu(ev, list);
			};
			document.addEventListener('contextmenu', contextmenuHandler, true);
			dismissHandler = (ev) => { if (!menuEl?.contains(ev.target)) hideMenu(); };
			document.addEventListener('click', dismissHandler, true);
			keydownHandler = (ev) => { if (ev.key === 'Escape') hideMenu(); };
			document.addEventListener('keydown', keydownHandler, true);
			scrollHandler = hideMenu;
			window.addEventListener('scroll', scrollHandler, true);

			// Shift-click would otherwise extend the browser's text selection
			// across the rows we're trying to multi-select. Cancelling the
			// mousedown's default for shift-clicks inside a list suppresses the
			// selection without breaking the click itself.
			mousedownHandler = (ev) => {
				if (!ev.shiftKey) return;
				if (!ev.target.closest(LIST_SELECTOR)) return;
				ev.preventDefault();
			};
			document.addEventListener('mousedown', mousedownHandler, true);

			styleEl = document.createElement('style');
			styleEl.dataset.travianQol = 'farmlist-multi-select';
			styleEl.textContent = HIGHLIGHT_CSS + MENU_CSS;
			document.documentElement.appendChild(styleEl);
		},
		destroy() {
			if (clickHandler) {
				document.removeEventListener('click', clickHandler, true);
				clickHandler = null;
			}
			if (mousedownHandler) {
				document.removeEventListener('mousedown', mousedownHandler, true);
				mousedownHandler = null;
			}
			if (contextmenuHandler) {
				document.removeEventListener('contextmenu', contextmenuHandler, true);
				contextmenuHandler = null;
			}
			if (dismissHandler) {
				document.removeEventListener('click', dismissHandler, true);
				dismissHandler = null;
			}
			if (keydownHandler) {
				document.removeEventListener('keydown', keydownHandler, true);
				keydownHandler = null;
			}
			if (scrollHandler) {
				window.removeEventListener('scroll', scrollHandler, true);
				scrollHandler = null;
			}
			menuEl?.remove();
			menuEl = null;
			if (styleEl) {
				styleEl.remove();
				styleEl = null;
			}
		},
	});
})();
