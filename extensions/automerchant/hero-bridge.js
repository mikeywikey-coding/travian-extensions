// Runs in the page's MAIN world (configured via manifest content_scripts.world).
// Bridges the isolated-world content script into Travian's own in-place
// "send hero resources" dialog.
//
// Travian wires the bordered resource rows on building/upgrade pages to:
//   window.Travian.React.Hero.openResourceTransfer({
//       targetResourceAmount: { lumber, clay, iron, crop },
//       onTransferFinish: Travian.Autoreload.autoreload,
//   })
// Calling that function from anywhere opens the transfer popup in place —
// no navigation to /hero/inventory required. Travian only exposes the
// clickable border on construction pages, so for troop training we summon
// the same dialog ourselves.
//
// Wire protocol:
//   • Isolated-world content script dispatches on `document`:
//       new CustomEvent('npc:open-hero-transfer', {
//         detail: { amounts: [l, c, i, cr], requestId }
//       })
//   • We respond on `document` with:
//       new CustomEvent('npc:hero-transfer-result', {
//         detail: { requestId, ok, reason }
//       })

(function () {
	if (window.__npcHeroBridgeInstalled) return;
	window.__npcHeroBridgeInstalled = true;

	// Capture the target cost of EVERY hero resource transfer — including the
	// ones Travian opens itself when the user clicks a bordered building cost,
	// not just the ones we summon. We wrap openResourceTransfer and forward
	// its `targetResourceAmount` to the isolated-world content script via a
	// DOM event; the original call is untouched. This is the only reliable
	// source of the per-resource target: the dialog's pre-filled boxes are
	// clamped deficits max(0, target - stock), which discard surpluses.
	function installTargetCapture() {
		const Hero = window.Travian
			&& window.Travian.React
			&& window.Travian.React.Hero;
		if (!Hero || typeof Hero.openResourceTransfer !== 'function') return false;
		if (Hero.openResourceTransfer.__npcWrapped) return true;
		const orig = Hero.openResourceTransfer;
		const wrapped = function (opts) {
			try {
				const t = opts && opts.targetResourceAmount;
				if (t) {
					document.dispatchEvent(
						new CustomEvent('npc:transfer-target', {
							detail: {
								target: [t.lumber || 0, t.clay || 0, t.iron || 0, t.crop || 0],
								ts: Date.now(),
							},
						}),
					);
				}
			} catch (err) {
				void err;
			}
			return orig.apply(this, arguments);
		};
		wrapped.__npcWrapped = true;
		Hero.openResourceTransfer = wrapped;
		return true;
	}
	// React may not have mounted the hero shell yet; retry briefly, then stop.
	if (!installTargetCapture()) {
		let tries = 0;
		const iv = setInterval(() => {
			if (installTargetCapture() || ++tries > 40) clearInterval(iv);
		}, 250);
	}

	document.addEventListener('npc:open-hero-transfer', (e) => {
		const detail = e.detail || {};
		const amounts = Array.isArray(detail.amounts) ? detail.amounts : [0, 0, 0, 0];
		const [lumber, clay, iron, crop] = amounts.map(
			(v) => Math.max(0, parseInt(v, 10) || 0),
		);
		const requestId = detail.requestId;

		const reply = (ok, reason) => {
			document.dispatchEvent(
				new CustomEvent('npc:hero-transfer-result', {
					detail: { requestId, ok, reason: reason || null },
				}),
			);
		};

		const fn = window.Travian
			&& window.Travian.React
			&& window.Travian.React.Hero
			&& window.Travian.React.Hero.openResourceTransfer;

		if (typeof fn !== 'function') {
			// Travian only exposes this on pages where the React hero shell has
			// mounted (most logged-in pages, but not /hero/inventory itself or
			// pre-login pages). Callers fall back to the legacy navigate flow.
			reply(false, 'openResourceTransfer-unavailable');
			return;
		}

		try {
			// onTransferFinish: prefer Travian's own autoreload so the page
			// refreshes the resource bars exactly the way the native border
			// click does. If autoreload isn't present, no-op — the dialog
			// itself still closes on completion.
			const onFinish = (window.Travian
				&& window.Travian.Autoreload
				&& window.Travian.Autoreload.autoreload)
				|| function () {};
			fn({
				targetResourceAmount: { lumber, clay, iron, crop },
				onTransferFinish: onFinish,
			});

			// The React hero dialog mounts inside #reactDialogWrapper which
			// ships with z-index:1500. Travian's classic dialog system (the
			// NPC trade popup) uses a different overlay that sits ABOVE
			// 1500, so when the user clicks Pull from inside the NPC dialog
			// the transfer popup opens hidden behind it. Raise the React
			// wrapper above the classic dialog so the transfer is always on
			// top. We do this on every open, so the value sticks even if
			// Travian resets it between mounts.
			const wrapper = document.getElementById('reactDialogWrapper');
			if (wrapper) wrapper.style.zIndex = '99999';

			reply(true, null);
		} catch (err) {
			reply(false, String((err && err.message) || err));
		}
	});
})();
