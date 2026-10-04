// Village resource grand-total (ex-OmniView).
// On the per-village resource statistics page, sum wood+clay+iron+crop per
// row and inject the total into the name cell. Reacts to in-place value
// updates (Travian mutates text nodes rather than swapping cells), so the
// MutationObserver needs characterData:true to catch them.
//
// Compliance note: read-only DOM aggregation. No clicks, no network calls.
(function () {
	const STYLE_ID = 'travian-qol-village-total-style';
	const CSS = `
		._ov-t {
			/* Push to the right side of the cell. */
			float: right !important;
			margin-right: 0px !important;

			/* Visual styling to match Travian's table cells. */
			font-family: Arial, Helvetica, sans-serif !important;
			font-size: 13px !important;
			color: #e0e2e8 !important;
			cursor: default !important;
		}
	`;

	let observer = null;
	let debounceTimer = null;
	let styleEl = null;

	function injectStyle() {
		if (document.getElementById(STYLE_ID)) return;
		styleEl = document.createElement('style');
		styleEl.id = STYLE_ID;
		styleEl.textContent = CSS;
		(document.head || document.documentElement).appendChild(styleEl);
	}

	function calculateVillageSums() {
		// Only run on the resources or production tabs. Match the FINAL path
		// segment, not a substring — sibling routes like
		// /statistics/resources/warehouse (which is NOT the resources summary)
		// would otherwise slip through a naive includes() check.
		const lastSeg = (
			window.location.pathname.split('/').filter(Boolean).pop() || ''
		).toLowerCase();
		const isProduction = lastSeg === 'production';
		const isResources = lastSeg === 'resources';
		if (!isResources && !isProduction) return;

		const rows = document.querySelectorAll('tr');

		rows.forEach((row) => {
			// The production page has a "Sum" footer row that already shows the
			// grand total — don't double-display on it. The resources page has
			// no such row, so we don't skip there.
			const isSumRow = row.textContent.trim().startsWith('Sum');
			if (isProduction && isSumRow) return;

			const cells = row.querySelectorAll('td');

			// Resource rows have Name + 4 resource columns + others. Anything
			// with fewer columns isn't a data row (header, separator, etc).
			if (cells.length < 5) return;

			let rowSum = 0;
			let isReady = true;

			// Columns 1-4 are Wood, Clay, Iron, Crop (column 0 is the village name).
			for (let i = 1; i <= 4; i++) {
				const text = cells[i].textContent.trim();

				// Travian shows "..." while values are still loading. Bail and
				// wait for the next observer fire.
				if (text.includes('...')) {
					isReady = false;
					break;
				}

				const numericText = text.replace(/[^\d]/g, '');

				// A non-empty cell with no digits means we're looking at a header
				// row that snuck past the column-count check. Skip it.
				if (text.length > 0 && numericText.length === 0) {
					isReady = false;
					break;
				}

				rowSum += parseInt(numericText) || 0;
			}

			if (!isReady || rowSum === 0) return;

			const nameCell = cells[0];
			let display = nameCell.querySelector('._ov-t');

			// Create the display span the first time, reuse it on subsequent updates.
			if (!display) {
				display = document.createElement('span');
				display.className = '_ov-t';
				nameCell.appendChild(display);
			}

			// toLocaleString() respects the player's browser locale, so the
			// thousands separator matches the rest of the page (1,234,567 / 1.234.567).
			const totalString = rowSum.toLocaleString();
			if (display.textContent !== totalString) {
				display.textContent = totalString;
			}
		});
	}

	function start() {
		// characterData:true is critical here — Travian updates resource values
		// by mutating existing text nodes (not by swapping cells), so a plain
		// childList observer misses every in-place update.
		observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(calculateVillageSums, 150);
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}

	window.TravianQoL.register({
		id: 'village-resource-total',
		label: 'Village resource grand-total',
		description: 'On the per-village resource/production statistics page, adds a wood+clay+iron+crop total beside each village name.',
		init() {
			// Page-scope guard: only run on the village statistics pages.
			if (!/\/village\/statistics\//.test(location.pathname)) return;

			injectStyle();
			calculateVillageSums();

			if (document.body) {
				start();
			} else {
				window.addEventListener('DOMContentLoaded', start, { once: true });
			}
		},
		destroy() {
			if (observer) {
				observer.disconnect();
				observer = null;
			}
			clearTimeout(debounceTimer);
			debounceTimer = null;
			if (styleEl && styleEl.parentNode) {
				styleEl.parentNode.removeChild(styleEl);
			}
			styleEl = null;
			// Remove the injected total spans we added.
			document.querySelectorAll('._ov-t').forEach((el) => el.remove());
		},
	});
})();
