// Report opener (ex-reportOpener).
// Injects an "Open Unread" button next to the Archive button on the report
// list page. Clicking it collects every unread report's URL and asks the
// background worker to open each one in a background tab.
//
// Compliance note: opens tabs only in direct response to a user click on
// our injected button. No timers, no automated openers, no fetches.
(function () {
	let observer = null;
	let debounceTimer = null;

	function openAllUnread() {
		const links = [];

		document.querySelectorAll('tr').forEach((row) => {
			// 1. Only look at rows with the unread indicator.
			if (!row.querySelector('.messageStatusUnread')) return;

			// 2. Find the report link in this row.
			//    Each unread row contains an 'id=' link to the report itself
			//    AND a separate 'build.php' link to the attacker's/defender's village.
			//    We want only the report link.
			const reportLink = Array.from(row.querySelectorAll('a')).find(
				(a) => a.href.includes('id=') && !a.href.includes('build.php'),
			);

			if (reportLink) links.push(reportLink.href);
		});

		// Dedupe — a single report can appear twice on filtered views.
		const uniqueLinks = [...new Set(links)];
		if (uniqueLinks.length === 0) return;

		chrome.runtime.sendMessage({ action: 'qol_open_tabs', urls: uniqueLinks });
	}

	// Insert an "Open Unread" button next to the existing Archive button.
	// Safe to call repeatedly — the id guard prevents duplicates.
	function injectButton() {
		if (document.getElementById('_ro-btn')) return;

		const wrapper = document.querySelector('.buttonWrapper');
		const archiveBtn = document.querySelector('button.archive');
		if (!wrapper || !archiveBtn) return;

		const btn = document.createElement('button');
		btn.id = '_ro-btn';
		btn.type = 'button';
		btn.className = 'textButtonV1 green'; // Reuse Travian's own button styling.
		btn.innerText = 'Open Unread';
		btn.style.cssText =
			'flex:0 1 auto;width:auto;padding:0 10px;margin:0 2px;height:25px';
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			openAllUnread();
		});

		// Wrapper defaults to inline; flex makes the new button line up cleanly.
		wrapper.style.display = 'flex';
		archiveBtn.after(btn);
	}

	function start() {
		// Travian re-renders the report list when the player changes pages or
		// filters, which drops our injected button. A debounced MutationObserver
		// re-injects it after each render burst settles.
		observer = new MutationObserver(() => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(injectButton, 100);
		});
		observer.observe(document.body, { childList: true, subtree: true });
		injectButton();
	}

	window.TravianQoL.register({
		id: 'report-opener',
		label: 'Open all unread reports button',
		description: 'Adds an "Open Unread" button next to Archive on the reports page; one click opens every unread report in a background tab.',
		init() {
			// Page-scope guard: only run on the reports page.
			if (!/\/report/.test(location.pathname)) return;

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
			const btn = document.getElementById('_ro-btn');
			if (btn) btn.remove();
		},
	});
})();
