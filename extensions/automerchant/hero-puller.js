/**
 * Travian NPC Resource Helper - Hero Inventory Auto-Puller
 *
 * The hero/inventory page exposes a direct transfer form with four
 * named inputs (lumber/clay/iron/crop) and a green "Transfer" button.
 * We fill those inputs and click Transfer — no per-resource popup loop.
 *
 * Two pull modes:
 *   - "exact"   each input gets the resource's needed amount as stored.
 *   - "divided" each input gets totalNeeded / 4 — used when the player
 *               plans to NPC-trade after the pull, so only total volume
 *               matters, not the per-resource split.
 *
 * The button can fire from any page the indicator is visible on. If we
 * aren't on /hero/inventory yet, persist the intent and navigate; on
 * load, init() picks it up and executes.
 */
/* global NPC */

NPC.HeroPuller = {
	FORM_TIMEOUT_MS: 1000,

	/**
	 * Open the hero → village resource transfer for the requested amounts.
	 *
	 * Preferred path: call Travian's own `openResourceTransfer` via the MAIN-
	 * world bridge (hero-bridge.js). This opens the transfer dialog in place
	 * — the exact same popup that Travian summons when you click the
	 * bordered resource cost on a building upgrade page. No navigation, no
	 * /hero/inventory round-trip, no DOM scraping of inputs.
	 *
	 * Fallback path: if the bridge reports the API isn't available on this
	 * page (very rare — basically only pre-login or odd legacy pages), we
	 * persist the intent and navigate to /hero/inventory, where init() picks
	 * it up and runs the legacy popup-and-fill flow.
	 *
	 * @param {number[]} amounts - [lumber, clay, iron, crop] — pull amounts
	 *   used by the legacy popup-fill path (filled into the form inputs as-is).
	 * @param {"exact"|"divided"} mode
	 * @param {string} [returnUrl] - explicit return URL for the legacy flow;
	 *   defaults to current page. Ignored when the native dialog opens, since
	 *   no navigation happens.
	 * @param {object} [opts]
	 * @param {number[]} [opts.targetThreshold] - threshold amounts for the
	 *   native API's `targetResourceAmount`. Travian itself computes
	 *   max(0, threshold - villageStock) to decide what to pre-fill — so this
	 *   should be the FULL cost the village needs to reach, not the deficit.
	 *   Defaults to `amounts` for backward compatibility (callers that want
	 *   the legacy "fill exactly these" semantics on the native path too).
	 */
	async requestPull(amounts, mode = "exact", returnUrl = null, opts = {}) {
		const nativeTarget = Array.isArray(opts.targetThreshold)
			? opts.targetThreshold
			: amounts;
		const opened = await this._tryNativeInPlace(nativeTarget);
		if (opened) return;

		try {
			localStorage.setItem(
				NPC.STORAGE_KEYS.AUTO_PULL,
				JSON.stringify({
					timestamp: Date.now(),
					amounts,
					mode,
					returnUrl: returnUrl || window.location.href,
					status: "pending",
				}),
			);
		} catch (e) {
			NPC.log.warn("Failed to save auto-pull intent", e);
			return;
		}
		if (this._onInventoryPage()) {
			this._execute();
		} else {
			window.location.href = "/hero/inventory";
		}
	},

	/**
	 * Ask the MAIN-world bridge to invoke Travian's native in-place transfer
	 * dialog. Returns true if the bridge reports success. The bridge always
	 * replies — on timeout we assume the MAIN-world script never loaded and
	 * fall back to the legacy navigate flow.
	 * @param {number[]} amounts
	 * @returns {Promise<boolean>}
	 */
	_tryNativeInPlace(amounts) {
		return new Promise((resolve) => {
			const requestId =
				"npc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
			let done = false;
			const finish = (ok) => {
				if (done) return;
				done = true;
				document.removeEventListener(
					"npc:hero-transfer-result",
					onResult,
				);
				resolve(ok);
			};
			const onResult = (e) => {
				if (!e.detail || e.detail.requestId !== requestId) return;
				finish(!!e.detail.ok);
			};
			document.addEventListener("npc:hero-transfer-result", onResult);
			document.dispatchEvent(
				new CustomEvent("npc:open-hero-transfer", {
					detail: { amounts, requestId },
				}),
			);
			// Bridge replies synchronously inside the same task — 500ms is
			// generous and only kicks in if hero-bridge.js never loaded.
			setTimeout(() => finish(false), 500);
		});
	},

	_onInventoryPage() {
		return window.location.pathname.includes("/hero/inventory");
	},

	_load() {
		try {
			const raw = localStorage.getItem(NPC.STORAGE_KEYS.AUTO_PULL);
			if (!raw) return null;
			const data = JSON.parse(raw);
			if (Date.now() - data.timestamp > 5 * 60 * 1000) {
				localStorage.removeItem(NPC.STORAGE_KEYS.AUTO_PULL);
				return null;
			}
			return data;
		} catch (e) {
			return null;
		}
	},

	_clear() {
		try {
			localStorage.removeItem(NPC.STORAGE_KEYS.AUTO_PULL);
		} catch {}
	},

	init() {
		if (!this._onInventoryPage()) return;

		const data = this._load();
		if (!data || data.status !== "pending") return;

		data.status = "running";
		try {
			localStorage.setItem(NPC.STORAGE_KEYS.AUTO_PULL, JSON.stringify(data));
		} catch {}

		this._execute(data);
	},

	async _execute(passed) {
		const data = passed || this._load();
		if (!data) return;

		const amounts = Array.isArray(data.amounts) ? data.amounts : [];
		const hasAny = amounts.some((a) => (parseInt(a, 10) || 0) > 0);
		if (!hasAny) {
			this._showProgress("Nothing to pull", true);
			this._clear();
			return;
		}

		this._showProgress("Opening transfer popup…");

		// The transfer form is a popup — opens when a resource heroItem is
		// clicked. Wait for inventory to render, then click a resource tile
		// (item IDs 145–148 = lumber/clay/iron/crop). We must NOT click
		// `.heroItem.consumable` blindly because bandages/ointments also
		// carry the `consumable` class and would open the wrong popup.
		const resourceTile = await this._waitFor(() => this._findResourceTile());
		if (!resourceTile) {
			this._showProgress("✗ No hero resources to pull", true);
			this._clear();
			return;
		}
		// Small humanizing pause before the click
		await NPC.Utils.sleep(NPC._rand(180, 320));
		resourceTile.click();

		// Now wait for the popup's form to render
		const lumberInput = await this._waitFor(() =>
			document.querySelector('input[name="lumber"]'),
		);
		if (!lumberInput) {
			this._showProgress("✗ Transfer popup didn't open", true);
			this._clear();
			return;
		}

		const form = lumberInput.closest("form");
		const inputs = {
			lumber: form?.querySelector('input[name="lumber"]'),
			clay: form?.querySelector('input[name="clay"]'),
			iron: form?.querySelector('input[name="iron"]'),
			crop: form?.querySelector('input[name="crop"]'),
		};
		if (!inputs.lumber || !inputs.clay || !inputs.iron || !inputs.crop) {
			this._showProgress("✗ Resource inputs missing", true);
			this._clear();
			return;
		}

		this._showProgress("Filling values…");
		// Cap each by what hero actually has on hand
		const available = this._readHeroStock();
		const finalValues = [0, 1, 2, 3].map((i) => {
			const want = parseInt(amounts[i], 10) || 0;
			const have = available[i];
			return have != null ? Math.max(0, Math.min(want, have)) : Math.max(0, want);
		});

		const names = ["lumber", "clay", "iron", "crop"];
		// Only touch (focus/fill) inputs for resources we actually need to pull.
		// Zero-amount resources are skipped entirely so we don't click their
		// boxes — the form defaults them to 0 anyway.
		const toFill = names
			.map((n, i) => ({ input: inputs[n], value: finalValues[i] }))
			.filter(({ value }) => (parseInt(value, 10) || 0) > 0);
		await NPC.Utils.setMultipleInputsAsync(toFill, "hero");

		// Travian re-enables the Transfer button after the inputs settle
		await NPC.Utils.sleep(NPC._rand(350, 600));

		const transferBtn = this._findTransferButton(form);
		if (!transferBtn) {
			this._showProgress("✗ Transfer button not found", true);
			this._clear();
			return;
		}

		this._showProgress("Sending transfer…");
		transferBtn.click();

		// Wait for the form to clear or page to reload as confirmation
		const ok = await this._waitForReset(inputs, 350);
		this._clear();

		this._showProgress(
			ok ? "✓ Transfer sent — returning…" : "Transfer clicked — returning…",
			true,
		);

		const returnUrl = data.returnUrl;
		setTimeout(() => {
			if (returnUrl && returnUrl !== window.location.href) {
				window.location.href = returnUrl;
			} else {
				this._hideProgress();
			}
		}, 1200);
	},

	_hideProgress() {
		document.querySelector("#_npc-pull-progress")?.remove();
	},

	/** Reads the displayed hero stock from the four resource heroItem tiles. */
	_readHeroStock() {
		const out = [null, null, null, null];
		for (let i = 0; i < 4; i++) {
			const itemDiv = document.querySelector(`.item.item${145 + i}`);
			const wrap = itemDiv?.closest(".heroItem");
			const txt = wrap?.querySelector(".count, .amount")?.textContent;
			const n = txt ? NPC.Utils.parseNumber(txt) : NaN;
			out[i] = Number.isFinite(n) ? n : null;
		}
		return out;
	},

	_findTransferButton(form) {
		// "Transfer" (not "Transfer maximum") — match exact text first.
		// Skip any button that's currently disabled.
		const candidates = Array.from(
			(form || document).querySelectorAll("button"),
		).filter((b) => !b.disabled && !b.classList.contains("disabled"));

		const exact = candidates.find(
			(b) => b.textContent.trim().toLowerCase() === "transfer",
		);
		if (exact) return exact;

		// Fallback: any green button whose text includes "transfer" but
		// not "maximum"
		return (
			candidates.find((b) => {
				const t = b.textContent.trim().toLowerCase();
				return (
					b.classList.contains("green") &&
					t.includes("transfer") &&
					!t.includes("max")
				);
			}) || null
		);
	},

	_waitForReset(inputs, timeoutMs) {
		return new Promise((resolve) => {
			const start = Date.now();
			const tick = () => {
				const allZero = ["lumber", "clay", "iron", "crop"].every(
					(n) => (parseInt(inputs[n]?.value, 10) || 0) === 0,
				);
				if (allZero) return resolve(true);
				if (Date.now() - start > timeoutMs) return resolve(false);
				setTimeout(tick, 200);
			};
			tick();
		});
	},

	/**
	 * Find a resource heroItem tile (lumber/clay/iron/crop = item145–148).
	 * Bandages/ointments share the `.consumable` class, so we match by the
	 * resource item ID instead.
	 */
	_findResourceTile() {
		for (let i = 0; i < 4; i++) {
			const itemDiv = document.querySelector(`.item.item${145 + i}`);
			const wrap = itemDiv?.closest(".heroItem");
			if (wrap) return wrap;
		}
		return null;
	},

	/** Resolves with find()'s first truthy result, or null after FORM_TIMEOUT_MS. */
	_waitFor(find) {
		return new Promise((resolve) => {
			const existing = find();
			if (existing) return resolve(existing);
			const done = (el) => {
				observer.disconnect();
				clearTimeout(timer);
				resolve(el);
			};
			const observer = new MutationObserver(() => {
				const el = find();
				if (el) done(el);
			});
			observer.observe(document.body, { childList: true, subtree: true });
			const timer = setTimeout(() => done(find()), this.FORM_TIMEOUT_MS);
		});
	},

	_showProgress(message, isComplete = false) {
		let el = document.querySelector("#_npc-pull-progress");
		if (!el) {
			el = document.createElement("div");
			el.id = "_npc-pull-progress";
			// Non-blocking toast: pinned bottom-right, no overlay, pointer-events
			// off the wrapper so the page underneath stays fully interactive.
			el.style.cssText =
				"position:fixed;bottom:20px;right:20px;" +
				"background:#1e1e22;color:#e8e8ea;" +
				"padding:12px 16px;border-radius:8px;" +
				"border:1px solid #3a3a40;" +
				"box-shadow:0 6px 20px rgba(0,0,0,0.45);z-index:100000;" +
				"font-family:Verdana,sans-serif;font-size:12px;" +
				"min-width:220px;max-width:320px;pointer-events:none;";
			document.body.appendChild(el);
		}
		const icon = isComplete ? "✓" : "⏳";
		const color = isComplete ? "#7bd388" : "#9ab8ff";
		el.innerHTML =
			`<div style="display:flex;align-items:center;gap:10px;">` +
			`<div style="font-size:20px;color:${color};line-height:1;">${icon}</div>` +
			`<div style="font-weight:600;color:${color};font-size:12px;">${message}</div>` +
			`</div>`;
	},
};
