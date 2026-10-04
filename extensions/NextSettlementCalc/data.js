/** Shared page parsing and immutable state updates. No browser side effects. */
"use strict";
Object.assign(
	TSP,
	(() => {
		const {
			extractJson,
			extractProgression,
			computeRateSlope,
			parseGameNumber,
			normalizeSpeed,
			normalizeTownHall,
			nonNegative,
			predictSettlement,
			measuredRateSlope,
			CP_REQUIREMENTS,
			SECS_PER_DAY,
			TREND,
		} = TSP;
		const LOG_INTERVAL = 30 * 60000; // one scan entry per 30 min
		const LOG_EDIT_MERGE = 2 * 60000; // stepper clicks collapse into one edit
		const LOG_MAX = 3000; // ~60 days of scan entries per server
		const validNumber = (value) =>
			typeof value === "number" && Number.isFinite(value) && value >= 0;
		function serverOrigin(value) {
			try {
				const url = new URL(value);
				return /^https?:$/.test(url.protocol) &&
					!url.port &&
					!url.username &&
					!url.password &&
					/(^|\.)travian\.(com|de|us|fr|it|cz|pl|ru|tr|ae|net|co\.uk)$/.test(
						url.hostname,
					)
					? url.origin
					: null;
			} catch {
				return null;
			}
		}
		function decodeText(value) {
			const entities = {
				amp: "&",
				lt: "<",
				gt: ">",
				quot: '"',
				apos: "'",
				nbsp: " ",
			};
			return value.replace(
				/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
				(match, entity) => {
					if (entity[0] !== "#") return entities[entity.toLowerCase()];
					const code =
						entity[1].toLowerCase() === "x"
							? parseInt(entity.slice(2), 16)
							: Number(entity.slice(1));
					return code <= 0x10ffff ? String.fromCodePoint(code) : match;
				},
			);
		}
		const text = (html) => decodeText(html.replace(/<[^>]*>/g, "")).trim();
		function attribute(tag, key) {
			return (
				tag.match(
					new RegExp("(?:^|\\s)" + key + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"),
				)?.[1] ?? null
			);
		}
		function parseVillages(html, observedAt) {
			const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];
			const table = tables.find(
				(t) => attribute(t.slice(0, t.indexOf(">")), "id") === "culture_points",
			);
			if (!table) return undefined;
			const villages = [];
			for (const row of table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
				const cells = {};
				for (const match of row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
					for (const cls of (attribute(match[1], "class") || "").split(/\s+/))
						cells[cls] = match[2];
				}
				if (!cells.vil || !cells.cps || !/<a\b/i.test(cells.vil)) continue;
				const name = text(cells.vil);
				const id = decodeText(cells.vil).match(/[?&]newdid=(\d+)/)?.[1] || name;
				const timer = (cells.cel || "")
					.match(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)
					?.find((tag) =>
						(attribute(tag.slice(0, tag.indexOf(">")), "class") || "")
							.split(/\s+/)
							.includes("timer"),
					);
				let seconds = 0;
				if (timer) {
					const visible = text(timer)
						.replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
						.match(/^(\d+):(\d{2}):(\d{2})$/);
					seconds = visible
						? Number(visible[1]) * 3600 +
							Number(visible[2]) * 60 +
							Number(visible[3])
						: nonNegative(
								attribute(timer.slice(0, timer.indexOf(">")), "value"),
							);
				}
				villages.push({
					id,
					name,
					cpProduction: nonNegative(parseGameNumber(text(cells.cps))),
					cooldownEndsAt: seconds > 0 ? observedAt + seconds * 1000 : 0,
				});
			}
			// An empty/unrecognized table must not delete all saved villages.
			return villages.length ? villages : undefined;
		}
		function parsePage(html, origin, observedAt = Date.now()) {
			const overview = extractJson(html, "culturalPointsOverview");
			const rank = extractJson(html, "culturePointsRank")?.rank;
			const speed = normalizeSpeed(
				new URL(origin).hostname.match(/\.x(\d+)\./)?.[1],
			);
			// cpProducedForNextSlot only counts CP earned since the current slot's
			// threshold. Targets are cumulative, so add that threshold back.
			const slotBase =
				CP_REQUIREMENTS[speed][Math.trunc(nonNegative(overview?.usedSlots)) - 1];
			const totalCp =
				rank?.soFar?.cpProduction ??
				(validNumber(overview?.cpProducedForNextSlot) && validNumber(slotBase)
					? slotBase + overview.cpProducedForNextSlot
					: undefined);
			const actualDailyCp =
				overview?.cpProductionTotal ?? rank?.perDay?.cpProduction;
			const progression = extractProgression(html);
			const villages = parseVillages(html, observedAt);
			const scan = {
				observedAt,
				timerObservedAt: observedAt,
				speed,
				hasData: false,
			};
			if (validNumber(totalCp)) scan.totalCp = totalCp;
			if (validNumber(actualDailyCp)) scan.actualDailyCp = actualDailyCp;
			if (villages) scan.villages = villages;
			if (Array.isArray(progression))
				scan.passiveAccel = computeRateSlope(progression);
			scan.hasData =
				validNumber(totalCp) || validNumber(actualDailyCp) || !!villages;
			return scan;
		}
		/** [time, daily CP] at each rate change, trimmed to the measured window. */
		function recordRate(previous, at, daily) {
			const history = (Array.isArray(previous) ? previous : []).filter(
				(entry) => Array.isArray(entry) && entry[0] <= at,
			);
			if (history.at(-1)?.[1] !== daily) history.push([at, daily]);
			const from = at - TREND.MEASURED_DAYS * SECS_PER_DAY * 1000;
			const anchor = history.findLastIndex(([time]) => time <= from);
			return anchor > 0 ? history.slice(anchor) : history;
		}
		function mergeScan(previous = {}, scan) {
			const next = { ...previous };
			const oldVillages = (
				Array.isArray(previous.villages) ? previous.villages : []
			).filter(Boolean);
			next.villages = oldVillages.map((village) =>
				Number.isFinite(village.cooldownEndsAt)
					? village
					: {
							...village,
							cooldownEndsAt:
								village.timerSeconds > 0 && previous.lastUpdate > 0
									? previous.lastUpdate + village.timerSeconds * 1000
									: 0,
						},
			);
			const observedAt = nonNegative(scan.observedAt);
			if (scan.speed) next.speed = normalizeSpeed(scan.speed);
			if (
				validNumber(scan.totalCp) &&
				observedAt >= nonNegative(previous.lastUpdate)
			) {
				// The game can publish CP late, so an unchanged value only shows
				// it has not moved since it first appeared. Project from there.
				next.cpSince =
					scan.totalCp === previous.totalCp && previous.lastUpdate > 0
						? previous.cpSince || previous.lastUpdate
						: observedAt;
				next.totalCp = scan.totalCp;
				next.lastUpdate = observedAt;
				if (validNumber(scan.actualDailyCp)) {
					next.actualDailyCp = scan.actualDailyCp;
					next.rateHistory = recordRate(
						previous.rateHistory,
						observedAt,
						scan.actualDailyCp,
					);
				}
				if (validNumber(scan.passiveAccel))
					next.passiveAccel = scan.passiveAccel;
			} else if (!previous.lastUpdate && validNumber(scan.actualDailyCp))
				next.actualDailyCp = scan.actualDailyCp;
			const timerObservedAt = nonNegative(scan.timerObservedAt, observedAt);
			if (
				Array.isArray(scan.villages) &&
				timerObservedAt >= nonNegative(previous.villagesUpdatedAt)
			) {
				next.villages = scan.villages
					.filter((v) => v && typeof v.name === "string")
					.map((village) => {
						const old =
							oldVillages.find((v) =>
								v.id
									? String(v.id) === String(village.id)
									: v.name === village.name ||
										decodeText(String(v.name || "")) === village.name,
							) || {};
						const townHall = normalizeTownHall(old.townHall);
						const largeCel = townHall >= 10 && !!old.largeCel;
						return {
							id: String(village.id || village.name),
							name: village.name,
							cpProduction: nonNegative(village.cpProduction),
							townHall,
							smallCel:
								old.smallCel ??
								(village.cooldownEndsAt > timerObservedAt && !largeCel),
							largeCel,
							cooldownEndsAt: nonNegative(village.cooldownEndsAt),
						};
					});
				next.villagesUpdatedAt = timerObservedAt;
			}
			return next;
		}
		function updateVillage(previous, id, updates) {
			return {
				...previous,
				villages: (previous.villages || []).map((village) => {
					if (String(village.id || village.name) !== String(id)) return village;
					const next = {
						...village,
						townHall: normalizeTownHall(updates.townHall ?? village.townHall),
					};
					if (typeof updates.smallCel === "boolean") {
						next.smallCel = updates.smallCel;
					}
					if (typeof updates.largeCel === "boolean") {
						next.largeCel = updates.largeCel;
					}
					if (next.townHall < 10) next.largeCel = false;
					return next;
				}),
			};
		}
		function defaultTarget(data) {
			const thresholds = CP_REQUIREMENTS[normalizeSpeed(data?.speed)];
			return (
				thresholds.find((cp) => cp > nonNegative(data?.totalCp)) ||
				thresholds.at(-1)
			);
		}
		function forecastInputs(data, target, now) {
			const villages = (data.villages || []).filter(Boolean);
			const daily =
				data.actualDailyCp ??
				villages.reduce((sum, v) => sum + nonNegative(v.cpProduction), 0);
			return {
				totalCp: data.totalCp,
				passiveRate: nonNegative(daily) / SECS_PER_DAY,
				passiveAccel: data.passiveAccel,
				measuredAccel: measuredRateSlope(
					data.rateHistory,
					data.actualDailyCp,
					data.lastUpdate,
				),
				villages,
				speed: data.speed,
				target,
				dt: (now - (data.cpSince || data.lastUpdate)) / 1000,
				now,
			};
		}
		/**
		 * One forecast sample for later accuracy analysis. ETAs are absolute
		 * timestamps (null = no forecast) so samples taken at different times
		 * can be compared with the moment the target was actually reached.
		 */
		const perDaySquared = (accel) =>
			Math.round(nonNegative(accel) * SECS_PER_DAY * SECS_PER_DAY * 100) / 100;
		function forecastEntry(data, target, now, reason, model) {
			if (!validNumber(data?.totalCp) || !data.lastUpdate) return null;
			const inputs = forecastInputs(data, target, now);
			const eta = (options) => {
				const { seconds } = predictSettlement({ ...inputs, ...options });
				return target > 0 && Number.isFinite(seconds)
					? Math.round(now + seconds * 1000)
					: null;
			};
			return {
				t: now,
				reason,
				model,
				obsAt: data.lastUpdate,
				cp: data.totalCp,
				daily: Math.round(inputs.passiveRate * SECS_PER_DAY * 100) / 100,
				accelPerDay: perDaySquared(data.passiveAccel),
				measuredAccelPerDay: perDaySquared(inputs.measuredAccel),
				speed: normalizeSpeed(data.speed),
				target,
				eta: {
					parties: eta({}),
					baseline: eta({ villages: [] }),
					growth: eta({ useGrowthTrend: true }),
				},
				villages: inputs.villages.map((v) => ({
					id: String(v.id || v.name),
					name: v.name,
					cp: nonNegative(v.cpProduction),
					th: normalizeTownHall(v.townHall),
					sc: !!v.smallCel,
					lc: !!v.largeCel,
					cd: nonNegative(v.cooldownEndsAt),
				})),
			};
		}
		const loggedVillages = (log) => log.findLast((e) => e.villages)?.villages;
		/**
		 * Append a sample, throttling scans to LOG_INTERVAL (except the scan that
		 * first reaches the target) and storing villages only when they change.
		 */
		function appendForecastLog(previous, entry) {
			const log = (Array.isArray(previous) ? previous : []).filter(Boolean);
			if (!entry) return log;
			let last = log.at(-1);
			if (
				entry.reason !== "scan" &&
				last?.reason === entry.reason &&
				entry.t - last.t < LOG_EDIT_MERGE
			) {
				log.pop();
				last = log.at(-1);
			} else if (entry.reason === "scan" && last) {
				const reached = entry.target > 0 && entry.cp >= entry.target;
				const crossed = reached && !(last.cp >= entry.target);
				if (
					!(entry.obsAt > last.obsAt) ||
					(!crossed &&
						entry.target === last.target &&
						entry.t - last.t < LOG_INTERVAL)
				)
					return log;
			}
			const { villages, ...rest } = entry;
			log.push(
				JSON.stringify(villages) === JSON.stringify(loggedVillages(log))
					? rest
					: entry,
			);
			const drop = log.length - LOG_MAX;
			if (drop > 0) {
				if (!log[drop].villages)
					log[drop] = {
						...log[drop],
						villages: loggedVillages(log.slice(0, drop + 1)),
					};
				log.splice(0, drop);
			}
			return log;
		}
		return {
			serverOrigin,
			parsePage,
			mergeScan,
			updateVillage,
			defaultTarget,
			forecastInputs,
			forecastEntry,
			appendForecastLog,
		};
	})(),
);
