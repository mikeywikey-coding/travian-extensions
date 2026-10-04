/**
 * shared.js — Travian Settlement Planner: Shared Constants & Utilities
 *
 * This module is loaded by background.js, content.js, and popup.js.
 * It attaches everything to `globalThis.TSP` so it works in all contexts
 * (background service worker, content scripts, popup) without ES module imports.
 */

/* eslint-disable no-unused-vars */
"use strict";

globalThis.TSP = (() => {
	// =========================================================================
	//  BROWSER API SHIM
	// =========================================================================

	/** @type {typeof chrome} Chrome extension API */
	const api = chrome;

	// =========================================================================
	//  TIME CONSTANTS (avoids magic numbers throughout the codebase)
	// =========================================================================

	const SECS_PER_DAY = 86400;
	const SECS_PER_HOUR = 3600;
	const SECS_PER_MIN = 60;

	/** Pre-computed square of SECS_PER_DAY, used to convert CP/day² → CP/sec² */
	const DAY_SQUARED = SECS_PER_DAY * SECS_PER_DAY; // 86400²

	// =========================================================================
	//  PREDICTION MODEL TUNING
	// =========================================================================

	/**
	 * The passive CP rate climbs while the player upgrades culture buildings
	 * (e.g. 108 → 293 CP/day over the first week). We estimate that growth from
	 * the production-rate history and project it forward as a bounded
	 * acceleration. These constants keep the trend honest:
	 */
	const TREND = {
		/** Only fit the slope over the most recent N days of rate history. */
		WINDOW_DAYS: 14,
		/**
		 * Cap the projected rate at this multiple of the current rate. The trend
		 * captures a near-term build-up spurt; it must not extrapolate a finite
		 * spurt into infinite growth on a long endgame horizon.
		 */
		MAX_GROWTH: 2.5,
		/** Measure our own production readings over this many recent days. */
		MEASURED_DAYS: 3,
		/** A shorter span of readings is not evidence of growth. */
		MIN_MEASURED_HOURS: 12,
	};

	// =========================================================================
	//  GAME DATA CONSTANTS
	// =========================================================================

	/** Base celebration caps. Speed scaling is defined separately by Travian. */
	const CEL_CAPS = { small: 500, large: 2000 };

	/**
	 * CP thresholds required for each village slot, keyed by server speed.
	 * Index = village number (0-based), value = cumulative CP needed.
	 */
	const CP_REQUIREMENTS = {
		1: [
			0, 2000, 8000, 20000, 39000, 65000, 99000, 141000, 191000, 251000, 319000,
			397000, 486000, 584000, 692000, 811000, 941000, 1082000, 1234000, 1397000,
			1572000, 1759000, 1957000, 2168000, 2391000, 2627000, 2874000, 3135000,
			3409000, 3695000, 3995000, 4308000, 4634000, 4974000, 5327000, 5695000,
			6076000, 6471000, 6881000, 7304000, 7742000, 8195000, 8662000, 9143000,
			9640000, 10151000, 10677000, 11219000, 11775000, 12347000,
		],
		2: [
			0, 800, 3900, 10000, 19400, 32400, 49300, 70300, 95500, 125300, 159600,
			198700, 242800, 291800, 346100, 405600, 470500, 540900, 616900, 698600,
			786100, 879400, 978700, 1084100, 1195600, 1313300, 1437200, 1567600,
			1704300, 1847600, 1997400, 2153900, 2317000, 2487000, 2663700, 2847400,
			3038000, 3235600, 3440300, 3652100, 3871000, 4097300, 4330800, 4571600,
			4819800, 5075500, 5338700, 5609400, 5887700, 6173600,
		],
		3: [
			0, 500, 2600, 6700, 12900, 21600, 32900, 46900, 63700, 83500, 106400,
			132500, 161900, 194600, 230700, 270400, 313700, 360600, 411300, 465700,
			524000, 586300, 652500, 722700, 797000, 875500, 958200, 1045000, 1136200,
			1231700, 1331600, 1435900, 1544700, 1658000, 1775800, 1898300, 2025300,
			2157100, 2293500, 2434700, 2580700, 2731500, 2887200, 3047700, 3213200,
			3383700, 3559100, 3739600, 3925100, 4115800,
		],
		5: [
			0, 300, 1600, 4000, 7800, 13000, 19700, 28100, 38200, 50100, 63800, 79500,
			97100, 116700, 138400, 162200, 188200, 216400, 246800, 279400, 314400,
			351800, 391500, 433600, 478200, 525300, 574900, 627000, 681700, 739000,
			799000, 861600, 926800, 994800, 1065500, 1139000, 1215200, 1294200,
			1376100, 1460800, 1548400, 1638900, 1732300, 1828600, 1927900, 2030200,
			2135500, 2243800, 2355100, 2469500,
		],
		10: [
			0, 200, 800, 2000, 3900, 6500, 9900, 14100, 19100, 25100, 31900, 39700,
			48600, 58400, 69200, 81100, 94100, 108200, 123400, 139700, 157200, 175900,
			195700, 216800, 239100, 262700, 287400, 313500, 340900, 369500, 399500,
			430800, 463400, 497400, 532700, 569500, 607600, 647100, 688100, 730400,
			774200, 819500, 866200, 914300, 964000, 1015100, 1067700, 1121900,
			1177500, 1234700,
		],
	};

	/** Small celebration duration in seconds at x1 speed, indexed by Town Hall level (1–20) */
	const SMALL_CEL_SECS = [
		0, // Lvl 0 (placeholder)
		86400, // Lvl 1:  24:00:00
		83290, // Lvl 2:  23:08:10
		80291, // Lvl 3:  22:18:11
		77401, // Lvl 4:  21:30:01
		74614, // Lvl 5:  20:43:34
		71928, // Lvl 6:  19:58:48
		69339, // Lvl 7:  19:15:39
		66843, // Lvl 8:  18:34:03
		64436, // Lvl 9:  17:53:56
		62117, // Lvl 10: 17:15:17
		59880, // Lvl 11: 16:38:00
		57725, // Lvl 12: 16:02:05
		55647, // Lvl 13: 15:27:27
		53643, // Lvl 14: 14:54:03
		51712, // Lvl 15: 14:21:52
		49850, // Lvl 16: 13:50:50
		48056, // Lvl 17: 13:20:56
		46326, // Lvl 18: 12:52:06
		44658, // Lvl 19: 12:24:18
		43050, // Lvl 20: 11:57:30
	];

	/** Large celebration duration in seconds at x1 speed (available from TH level 10+) */
	const LARGE_CEL_SECS = [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0, // Levels 0–9: not available
		155291, // Lvl 10: 43:08:11
		149701, // Lvl 11: 41:35:01
		144312, // Lvl 12: 40:05:12
		139116, // Lvl 13: 38:38:36
		134108, // Lvl 14: 37:15:08
		129280, // Lvl 15: 35:54:40
		124626, // Lvl 16: 34:37:06
		120140, // Lvl 17: 33:22:20
		115815, // Lvl 18: 32:10:15
		111645, // Lvl 19: 31:00:45
		107626, // Lvl 20: 29:53:46
	];

	// Speed affects celebrations differently from construction and production.
	// https://support.travian.com/en/articles/20-game-versions-and-speed
	const CELEBRATION_FACTOR = { 1: 1, 2: 1, 3: 2, 5: 2, 10: 4 };
	const nonNegative = (value, fallback = 0) =>
		Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
	const normalizeSpeed = (value) =>
		Object.hasOwn(CP_REQUIREMENTS, value) ? Number(value) : 1;
	const normalizeTownHall = (value) =>
		Math.max(1, Math.min(20, Math.trunc(nonNegative(value, 1))));

	function parseGameNumber(value) {
		if (typeof value === "number")
			return Number.isFinite(value) ? Math.round(value) : 0;
		if (typeof value !== "string") return 0;
		const text = value
			.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u2066-\u2069]/g, "")
			.trim();
		const abbreviated = text.match(/^(-?[\d\s.,]+)\s*([km])$/i);
		if (abbreviated) {
			const amount = Number(
				abbreviated[1].replace(/\s/g, "").replace(",", "."),
			);
			return Number.isFinite(amount)
				? Math.round(amount * (/k/i.test(abbreviated[2]) ? 1000 : 1e6))
				: 0;
		}
		return Number(text.replace(/[\s.,'’]/g, "")) || 0;
	}

	/** Read a JSON value embedded in page source, respecting escaped strings. */
	function extractJson(html, key) {
		const pattern = new RegExp('"' + key + '"\\s*:\\s*([\\[{])', "g");
		let match;
		while ((match = pattern.exec(html))) {
			const start = pattern.lastIndex - 1;
			let depth = 0,
				quoted = false,
				escaped = false;
			for (let i = start; i < html.length; i++) {
				const char = html[i];
				if (quoted) {
					if (escaped) escaped = false;
					else if (char === "\\") escaped = true;
					else if (char === '"') quoted = false;
				} else if (char === '"') quoted = true;
				else if (char === "{" || char === "[") depth++;
				else if (char === "}" || char === "]") {
					if (--depth === 0) {
						try {
							return JSON.parse(html.slice(start, i + 1));
						} catch {
							break;
						}
					}
				}
			}
		}
		return null;
	}

	function extractProgression(html) {
		return (
			extractJson(html, "culturePointsRank")?.progression?.perDay ??
			extractJson(html, "progression")?.perDay ??
			null
		);
	}

	function computeRateSlope(progression) {
		if (!Array.isArray(progression)) return 0;
		const byDay = new Map();
		for (const p of progression) {
			if (
				p &&
				Number.isFinite(p.day) &&
				Number.isFinite(p.culture_points) &&
				p.culture_points >= 0
			) {
				byDay.set(p.day, p.culture_points);
			}
		}
		const days = [...byDay.keys()].sort((a, b) => a - b);
		const last = days.at(-1);
		const points = days
			.filter((d) => d > last - TREND.WINDOW_DAYS)
			.map((d) => [d, byDay.get(d)]);
		if (points.length < 3) return 0;
		const meanX = points.reduce((s, p) => s + p[0], 0) / points.length;
		const meanY = points.reduce((s, p) => s + p[1], 0) / points.length;
		let variance = 0,
			covariance = 0;
		for (const [x, y] of points) {
			variance += (x - meanX) ** 2;
			covariance += (x - meanX) * (y - meanY);
		}
		return variance ? Math.max(0, covariance / variance / DAY_SQUARED) : 0;
	}

	/**
	 * Production growth the planner observed itself: the change in daily CP
	 * over the last MEASURED_DAYS. `history` holds [time, daily CP] pairs, each
	 * the first reading of that rate; `daily` was read at `at`.
	 */
	function measuredRateSlope(history, daily, at) {
		const finite = Number.isFinite;
		if (!Array.isArray(history) || !finite(daily) || !finite(at)) return 0;
		const from = at - TREND.MEASURED_DAYS * SECS_PER_DAY * 1000;
		let start = null;
		for (const entry of history) {
			if (!Array.isArray(entry) || !finite(entry[0]) || !finite(entry[1]))
				continue;
			if (entry[0] <= from) start = [from, entry[1]];
			else {
				start ??= entry;
				break;
			}
		}
		const span = start ? (at - start[0]) / 1000 : 0;
		if (span < TREND.MIN_MEASURED_HOURS * SECS_PER_HOUR) return 0;
		return Math.max(0, (daily - start[1]) / SECS_PER_DAY / span);
	}

	function passiveGain(v, a, cap, seconds) {
		if (seconds <= 0) return 0;
		if (!a) return v * seconds;
		const ramp = Math.min(seconds, Math.max(0, (cap - v) / a));
		return v * ramp + (a * ramp * ramp) / 2 + cap * (seconds - ramp);
	}

	function getCelebrationDuration(type, level, speed) {
		const normalized = normalizeTownHall(level);
		if (type === "large" && normalized < 10) return 0;
		const table = type === "large" ? LARGE_CEL_SECS : SMALL_CEL_SECS;
		return table[normalized] / CELEBRATION_FACTOR[normalizeSpeed(speed)];
	}

	function cooldownRemaining(village, now, elapsed = 0) {
		if (Number.isFinite(village.cooldownEndsAt))
			return Math.max(0, (village.cooldownEndsAt - now) / 1000);
		return Math.max(
			0,
			nonNegative(village.timerSeconds) - nonNegative(elapsed),
		);
	}

	/** Seconds from now until the running celebration ends; null when none runs. */
	function cooldownEnd(village, now, elapsed) {
		if (Number.isFinite(village.cooldownEndsAt))
			return village.cooldownEndsAt > 0
				? (village.cooldownEndsAt - now) / 1000
				: null;
		const timer = nonNegative(village.timerSeconds);
		return timer > 0 ? timer - nonNegative(elapsed) : null;
	}

	/**
	 * Current CP includes only observed CP plus estimated passive production.
	 * Celebration checkboxes form a per-village queue (small before large).
	 * Active parties paid their CP already; the next one starts when their
	 * timer ends, even if it ended after the last village reading. Rewards
	 * that started before the CP measurement are already part of it.
	 * Summing scheduled rewards analytically avoids a lossy event-count cutoff.
	 */
	function predictSettlement(p = {}) {
		const total = nonNegative(p.totalCp);
		const rate = nonNegative(p.passiveRate);
		// The main forecast continues the production growth we measured, never
		// faster than the game's building history. Continuing that history
		// trend in full is the separate, optimistic scenario.
		const history = nonNegative(p.passiveAccel);
		const measured = nonNegative(p.measuredAccel);
		const trend = Number.isFinite(p.passiveAccel)
			? Math.min(measured, history)
			: measured;
		const accel = p.useGrowthTrend ? Math.max(trend, history) : trend;
		const elapsed = nonNegative(p.dt);
		const observed = -elapsed; // the CP measurement, in seconds from now
		const cap = rate * TREND.MAX_GROWTH;
		const currentCp = total + rate * elapsed;
		const velocity = rate;
		const target = nonNegative(p.target);
		const result = {
			seconds: 0,
			currentCp,
			ratePerDay: velocity * SECS_PER_DAY,
			reached: target > 0 && currentCp >= target,
		};
		if (!target || result.reached) return result;
		const now = Number.isFinite(p.now) ? p.now : Date.now();
		const factor = CELEBRATION_FACTOR[normalizeSpeed(p.speed)];
		const parties = (Array.isArray(p.villages) ? p.villages : [])
			.filter(Boolean)
			.flatMap((village) => {
				const queue = [
					...(village.smallCel ? ["small"] : []),
					...(village.largeCel ? ["large"] : []),
				]
					.map((type) => ({
						type,
						duration: getCelebrationDuration(type, village.townHall, p.speed),
					}))
					.filter((party) => party.duration > 0);
				if (!queue.length) return [];
				const cycle = queue.reduce((sum, party) => sum + party.duration, 0);
				const reward = Math.min(
					nonNegative(village.cpProduction),
					CEL_CAPS.small / factor,
				);
				const end = cooldownEnd(village, now, elapsed);
				const scheduled = [];
				// No single celebration lasts longer than `longest`, so a longer
				// timer includes a queued party. It pays once, when it starts.
				const longest = Math.max(
					getCelebrationDuration("small", village.townHall, p.speed),
					getCelebrationDuration("large", village.townHall, p.speed),
				);
				if (end !== null && end > longest + 60) {
					const last = queue.at(-1);
					scheduled.push({
						type: last.type,
						duration: Infinity,
						first: end - last.duration,
						reward,
					});
				}
				let offset = end ?? 0;
				for (const { type, duration } of queue) {
					let first = offset;
					// A party chained to an elapsed cooldown that started before the
					// CP measurement has paid already, and so has each repeat.
					if (end !== null && first <= observed)
						first += (Math.floor((observed - first) / cycle) + 1) * cycle;
					scheduled.push({ type, duration: cycle, first, reward });
					offset += duration;
				}
				return scheduled;
			});
		const futureCp = (seconds) => {
			let value = currentCp + passiveGain(velocity, accel, cap, seconds);
			for (const party of parties) {
				if (seconds < party.first) continue;
				const count = Math.floor((seconds - party.first) / party.duration) + 1;
				if (party.type === "small") {
					value += count * party.reward;
					continue;
				}
				const rewardCap = Math.min(cap * SECS_PER_DAY, CEL_CAPS.large / factor);
				const firstReward = Math.min(
					rewardCap,
					(velocity + accel * Math.max(0, party.first)) * SECS_PER_DAY,
				);
				const step = Number.isFinite(party.duration)
					? accel * party.duration * SECS_PER_DAY
					: 0;
				const rising =
					step > 0
						? Math.min(
								count,
								Math.max(0, Math.ceil((rewardCap - firstReward) / step)),
							)
						: count;
				value +=
					rising * firstReward +
					(step * rising * (rising - 1)) / 2 +
					(count - rising) * rewardCap;
			}
			return value;
		};
		if (futureCp(0) >= target) return result;
		if (
			velocity <= 0 &&
			!parties.some((party) => party.type === "small" && party.reward > 0)
		) {
			return { ...result, seconds: Infinity };
		}
		let high = SECS_PER_DAY;
		while (futureCp(high) < target && high < 1e14) high *= 2;
		if (futureCp(high) < target) return { ...result, seconds: Infinity };
		let low = 0;
		for (let i = 0; i < 64; i++) {
			const mid = (low + high) / 2;
			if (futureCp(mid) >= target) high = mid;
			else low = mid;
		}
		return { ...result, seconds: high };
	}

	function formatDuration(seconds) {
		if (!Number.isFinite(seconds)) return "—";
		const s = Math.max(0, Math.floor(seconds));
		return `${Math.floor(s / SECS_PER_DAY)}d ${Math.floor(s / SECS_PER_HOUR) % 24}h ${Math.floor(s / 60) % 60}m`;
	}
	function formatHMS(seconds) {
		const s = Math.max(0, Math.floor(nonNegative(seconds)));
		return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
			.map((v) => String(v).padStart(2, "0"))
			.join(":");
	}
	const storageKey = (server) => `tsp_data_${server}`;
	const targetCpKey = (server) => `tsp_target_cp_${server}`;
	const logKey = (server) => `tsp_log_${server}`;
	return {
		api,
		SECS_PER_DAY,
		CP_REQUIREMENTS,
		nonNegative,
		normalizeSpeed,
		normalizeTownHall,
		parseGameNumber,
		extractJson,
		extractProgression,
		TREND,
		computeRateSlope,
		measuredRateSlope,
		predictSettlement,
		formatDuration,
		formatHMS,
		getCelebrationDuration,
		cooldownRemaining,
		storageKey,
		targetCpKey,
		logKey,
	};
})();
