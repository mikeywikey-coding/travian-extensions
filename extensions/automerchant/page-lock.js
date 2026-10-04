// Runs in the page's MAIN world (configured via manifest content_scripts.world).
// Owns the per-input NPC lock: trap on `.value`, readOnly when engaged, plus a
// 🔓 toggle button next to each desired input. Travian's "Distribute remaining"
// runs in the page world too, so its writes go through this property trap.
//
// Why a separate file? Content scripts in the default isolated world cannot
// install per-instance property traps that the page sees. Inline <script>
// injection is blocked by Travian's CSP. A packaged MAIN-world script file is
// the only path that both runs in the page world AND passes CSP.

(function () {
	if (window.__npcLocksInstalled) return;
	window.__npcLocksInstalled = true;

	const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
	const nativeSet = valueDesc.set;
	const nativeGet = valueDesc.get;

	// Pool = sum of the current-resources row (#npc td.all). Computed fresh on
	// every call. We don't read Travian's "Rest:" cell because it only updates
	// in response to user keypresses, NOT to programmatic `.value` writes — so
	// after our redistribute, that cell is stale by exactly what we just
	// allocated. Trusting it on the next click would double-allocate.
	function getNpcPool() {
		const cells = document.querySelectorAll('#npc td.all');
		let sum = 0;
		cells.forEach((c) => {
			const n = parseInt((c.textContent || '').replace(/[^\d-]/g, ''), 10);
			if (Number.isFinite(n)) sum += n;
		});
		return sum;
	}

	// Top up the unlocked desired inputs with the live leftover from the
	// NPC's Rest cell. Whatever the user has typed stays — including unlocked
	// values, which are treated as a "minimum needed" baseline. The leftover
	// is split as floor(rest/N) per input, and the modulo remainder is spread
	// one-per-input across the first `remainder` unlocked inputs so the sum
	// hits the pool exactly — no residual, no overshoot. Locked inputs are
	// never touched. Returns true if anything actually ran.
	function redistribute() {
		const inputs = [0, 1, 2, 3].map((i) => document.querySelector('input[name="desired' + i + '"]'));
		if (inputs.some((x) => !x)) return false;
		const unlocked = inputs.filter((x) => !x.__npcLocked);
		if (unlocked.length === 0) return false;
		const pool = getNpcPool();
		const currentSum = inputs.reduce(
			(s, x) => s + (parseInt(nativeGet.call(x), 10) || 0),
			0,
		);
		const leftover = pool - currentSum;
		if (leftover <= 0) return false; // pool already fully allocated
		const base = Math.floor(leftover / unlocked.length);
		const remainder = leftover - base * unlocked.length;
		unlocked.forEach((x, i) => {
			const cur = parseInt(nativeGet.call(x), 10) || 0;
			const add = base + (i < remainder ? 1 : 0);
			nativeSet.call(x, String(cur + add));
			x.dispatchEvent(new Event('input', { bubbles: true }));
			x.dispatchEvent(new Event('change', { bubbles: true }));
			// Travian's Sum/Rest cells recompute on keyup, not on programmatic
			// .value writes. Without this, the dialog keeps showing the pre-
			// distribute Rest value — looks like there's still leftover when in
			// fact the inputs are balanced.
			x.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '0' }));
		});
		return true;
	}

	// Release every engaged lock and restore the 🔓 UI on each toggle button.
	// Input values are left alone — this only resets lock state.
	function unlockAll() {
		document.querySelectorAll('input[name^="desired"]').forEach((input) => {
			if (!input.__npcLocked) return;
			input.__npcLocked = false;
			input.__npcLockedValue = null;
			input.readOnly = false;
			const btn = input.nextElementSibling;
			if (btn && btn.classList && btn.classList.contains('_npc-lock-btn')) {
				btn.textContent = '🔓';
				btn.classList.remove('_npc-lock-on');
				btn.title = 'Lock this value — Distribute will not change it';
			}
		});
	}

	function setup() {
		for (let i = 0; i < 4; i++) {
			const input = document.querySelector('input[name="desired' + i + '"]');
			if (!input) continue;

			if (!input.__npcLockAttached) {
				input.__npcLockAttached = true;
				// Per-instance .value trap. Drops writes while locked. Our restore
				// uses nativeSet so it always lands regardless of trap state.
				Object.defineProperty(input, 'value', {
					configurable: true,
					enumerable: true,
					get() { return nativeGet.call(this); },
					set(v) {
						if (input.__npcLocked) return; // dropped — Distribute can't change a locked value
						nativeSet.call(this, v);
					},
				});
				// Fallback: catch writes that bypass the per-instance trap by
				// calling the prototype setter directly and then dispatching events.
				const guard = () => {
					if (input.__npcLocked && nativeGet.call(input) !== input.__npcLockedValue) {
						nativeSet.call(input, input.__npcLockedValue);
					}
				};
				input.addEventListener('input', guard, true);
				input.addEventListener('change', guard, true);
			}

			let btn = input.nextElementSibling && input.nextElementSibling.classList?.contains('_npc-lock-btn')
				? input.nextElementSibling
				: null;
			if (!btn) {
				btn = document.createElement('button');
				btn.type = 'button';
				btn.className = '_npc-lock-btn';
				btn.textContent = '🔓';
				input.insertAdjacentElement('afterend', btn);
			}
			if (btn.__npcLockBound) continue;
			btn.__npcLockBound = true;
			btn.title = 'Lock this value — Distribute will not change it';
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (input.__npcLocked) {
					input.__npcLocked = false;
					input.__npcLockedValue = null;
					input.readOnly = false;
					btn.textContent = '🔓';
					btn.classList.remove('_npc-lock-on');
					btn.title = 'Lock this value — Distribute will not change it';
				} else {
					input.__npcLocked = true;
					input.__npcLockedValue = nativeGet.call(input);
					input.readOnly = true;
					btn.textContent = '🔒';
					btn.classList.add('_npc-lock-on');
					btn.title = 'Unlock — value is currently held at ' + input.__npcLockedValue;
				}
				// Don't redistribute on lock toggle — the desired inputs hold
				// "minimum needed" values that the user typed (or pulled from
				// the troop calculator). Distribute is what tops them up.
			});
		}
	}

	// Intercept Travian's "Distribute remaining resources" button. With no
	// locks engaged, this is a no-op and Travian's own handler runs. With one
	// or more locks engaged, we cancel Travian's handler, run our own
	// lock-aware redistribution, then release every lock so the next click
	// reverts to Travian's stock behavior.
	document.addEventListener('click', (e) => {
		const btn = e.target && e.target.closest && e.target.closest('button, a');
		if (!btn) return;
		if (!/distribute/i.test(btn.textContent || '')) return;
		const inputs = [0, 1, 2, 3].map((i) => document.querySelector('input[name="desired' + i + '"]'));
		if (inputs.some((x) => !x)) return;
		if (!inputs.some((x) => x.__npcLocked)) return; // no locks → Travian's default is fine
		e.preventDefault();
		e.stopImmediatePropagation();
		redistribute();
		unlockAll();
	}, true);

	// Initial pass + observe future DOM mutations. Travian re-renders the
	// NPC dialog asynchronously after first paint, so we can't rely on a
	// single setup() call. Debounced to coalesce burst mutations, and skipped
	// outright (one cached live-list check) while no NPC dialog is open.
	setup();
	const desired = document.getElementsByName('desired0');
	let pending = 0;
	new MutationObserver(() => {
		if (pending || !desired.length) return;
		pending = setTimeout(() => { pending = 0; setup(); }, 50);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();
