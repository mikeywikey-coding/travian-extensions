/**
 * Travian NPC Resource Helper - Utilities & Logger
 */
/* global NPC */

// Console logging, silenced while NPC.CONFIG.STEALTH is on.
const _npcLog = (method, color) => (...args) => {
	if (!NPC.CONFIG.STEALTH) console[method]("%c[NPC Helper]", `color: ${color}`, ...args);
};
NPC.log = { success: _npcLog("log", "#4CAF50"), warn: _npcLog("warn", "#FF9800") };

/** Returns a random integer in [min, max] inclusive. */
NPC._rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

NPC.Utils = {
	parseNumber: (str) => {
		if (!str) return 0;
		return parseInt(String(str).replace(/[^\d-]/g, ""), 10) || 0;
	},

	formatNumber: (num) => num.toLocaleString(),

	/** Returns an inline HTML string for a Travian unit icon sprite. */
	unitIcon: (unitClass) => `<i class="unit ${unitClass}"></i>`,

	/**
	 * Returns a random delay for the given action profile.
	 * @param {string} profile - "ratio", "market", or "hero"
	 * @returns {number} Delay in milliseconds
	 */
	getRandomDelay(profile = "market") {
		const range =
			NPC.CONFIG.INPUT_DELAYS[profile.toUpperCase()] || NPC.CONFIG.INPUT_DELAYS.MARKET;
		return NPC._rand(range.MIN, range.MAX);
	},

	/**
	 * Sets an input value with human-like delays between DOM events.
	 * Events are spaced 20-50ms apart to avoid detectable synchronous bursts.
	 */
	setInputValue: async (input, value) => {
		input.focus();
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		).set;
		nativeInputValueSetter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await NPC.Utils.sleep(200 + Math.random() * 150);
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await NPC.Utils.sleep(215 + Math.random() * 90);
		input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
		input.blur();
	},

	/**
	 * Sets multiple input values sequentially with per-action delays.
	 * @param {Array<{input: HTMLInputElement, value: number}>} inputs
	 * @param {string} [profile="market"] - Delay profile: "ratio", "market", or "hero"
	 * @returns {Promise<void>}
	 */
	async setMultipleInputsAsync(inputs, profile = "market") {
		for (const { input, value } of inputs) {
			if (input && value !== undefined && value !== null) {
				await this.sleep(this.getRandomDelay(profile));
				await this.setInputValue(input, value);
			}
		}
	},

	/**
	 * Sleep utility for async delays.
	 * @param {number} ms - Milliseconds to sleep
	 * @returns {Promise<void>}
	 */
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

	/**
	 * Returns the four NPC desired input values as an array [lumber, clay, iron, crop].
	 * Missing inputs default to 0.
	 * @returns {number[]}
	 */
	getDesiredValues() {
		return Array.from({ length: 4 }, (_, i) => {
			const input = document.querySelector(`input[name="desired${i}"]`);
			return Math.max(0, NPC.Utils.parseNumber(input?.value));
		});
	},
};
