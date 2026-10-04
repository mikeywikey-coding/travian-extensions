// Adventure sort.
// On the hero adventures page, sort the adventure table rows by distance
// ascending (closest first). The page is server-rendered, but the table
// occasionally appears after initial document_idle (slow connections, late
// React mount), so we fall back to a short-lived MutationObserver if the
// table isn't there yet.
//
// Compliance note: pure DOM reordering of existing rows. No clicks, no
// network calls, no timers running long-term. Equivalent to the user
// clicking a column header.
(function () {
	const STYLE_ID = 'travian-qol-adventure-sort-style';
	const CSS = `
		table.adventureList.adv-sorted th.distance::after {
			content: " ↑";
			color: #2a7;
			font-weight: bold;
		}
	`;

	let observer = null;
	let timeoutId = null;
	let styleEl = null;

	function parseDistance(text) {
		// Strip Travian's invisible bidi markers before number-matching.
		const cleaned = text.replace(/[‪-‮⁦-⁩​-‏]/g, '');
		const match = cleaned.match(/(\d+(?:\.\d+)?)/);
		return match ? parseFloat(match[1]) : Infinity;
	}

	function sortAdventures() {
		const table = document.querySelector('table.adventureList');
		if (!table) return false;
		// Idempotency guard — init() may run again after destroy().
		if (table.dataset.advSorted === '1') return true;

		const parent = table.querySelector('tbody') || table;
		const rows = Array.from(parent.children).filter((el) => el.tagName === 'TR');
		const adventureRows = rows.filter((row) => row.querySelector('td.distance'));
		if (adventureRows.length < 2) {
			table.dataset.advSorted = '1';
			return true;
		}

		adventureRows
			.map((row) => ({ row, dist: parseDistance(row.querySelector('td.distance').textContent) }))
			.sort((a, b) => a.dist - b.dist)
			.forEach(({ row }) => parent.appendChild(row));

		table.dataset.advSorted = '1';
		table.classList.add('adv-sorted');
		return true;
	}

	function injectStyle() {
		if (document.getElementById(STYLE_ID)) return;
		styleEl = document.createElement('style');
		styleEl.id = STYLE_ID;
		styleEl.textContent = CSS;
		(document.head || document.documentElement).appendChild(styleEl);
	}

	window.TravianQoL.register({
		id: 'adventure-sort',
		label: 'Adventure list sort by distance',
		description: 'Sorts the hero adventures table so the closest adventure comes first.',
		init() {
			// Page-scope guard: only run on the hero adventures page.
			if (!/\/hero\/adventures/.test(location.pathname)) return;

			injectStyle();

			if (sortAdventures()) return;
			// Table not present yet — watch for it briefly.
			observer = new MutationObserver(() => {
				if (sortAdventures()) {
					observer.disconnect();
					observer = null;
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			timeoutId = setTimeout(() => {
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				timeoutId = null;
			}, 10000);
		},
		destroy() {
			if (observer) {
				observer.disconnect();
				observer = null;
			}
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			if (styleEl && styleEl.parentNode) {
				styleEl.parentNode.removeChild(styleEl);
			}
			styleEl = null;
		},
	});
})();
