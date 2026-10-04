/** Popup controller. Reads snapshots; sends narrow edits to the worker. */
"use strict";
(() => {
	const {
		api,
		CP_REQUIREMENTS,
		predictSettlement,
		forecastInputs,
		normalizeSpeed,
		normalizeTownHall,
		nonNegative,
		cooldownRemaining,
		updateVillage,
		formatDuration,
		formatHMS,
		storageKey,
		targetCpKey,
		logKey,
		serverOrigin,
	} = TSP;
	let server = null,
		data = null,
		readVersion = 0,
		villageSignature = "";
	let targetDate = null,
		zoom = 1,
		muted = false,
		refreshing = false,
		interval;
	let copyFeedbackUntil = 0,
		copyFeedback = "",
		errorMessage = "";
	const dom = {};

	async function request(action, fields = {}) {
		const response = await api.runtime.sendMessage({ action, ...fields });
		if (!response?.success)
			throw new Error(
				response?.error ||
					"Could not update CP Planner. Please reload the extension or try again.",
			);
		return response;
	}
	function report(error) {
		errorMessage = error.message;
		if (dom.statusNote) dom.statusNote.textContent = errorMessage;
	}
	function make(tag, className, text) {
		const element = document.createElement(tag);
		if (className) element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	}
	function updateMuteIcon() {
		dom.alarmToggle.textContent = muted ? "🔕" : "🔔";
		dom.alarmToggle.classList.toggle("muted", muted);
		dom.alarmToggle.title = muted ? "Enable alarm" : "Mute alarm";
		dom.alarmToggle.setAttribute("aria-label", dom.alarmToggle.title);
		dom.alarmToggle.setAttribute("aria-pressed", String(muted));
	}
	function applyZoom() {
		document.body.style.zoom = zoom;
	}
	function changeZoom(next) {
		zoom = Math.max(
			0.5,
			Math.min(2, Math.round(nonNegative(next, 1) * 10) / 10),
		);
		applyZoom();
		api.storage.local.set({ tsp_zoom: zoom }).catch(report);
	}
	function clearDisplay(message) {
		data = null;
		targetDate = null;
		villageSignature = "";
		dom.cpDisplay.textContent = "—";
		dom.totalProdDisplay.textContent = "—";
		dom.timeRemaining.textContent = "—";
		dom.targetDate.textContent = "—";
		dom.progressFill.style.width = "0%";
		dom.targetSlot.replaceChildren();
		dom.targetSlot.disabled = true;
		dom.villageList.replaceChildren(make("div", "empty-state", message));
		if (dom.statusNote) dom.statusNote.textContent = "";
		if (dom.forecastDetails) dom.forecastDetails.textContent = "";
		if (dom.forecastLabel) dom.forecastLabel.textContent = "CP forecast";
	}
	async function selectServer(origin) {
		server = origin;
		readVersion++;
		errorMessage = "";
		clearDisplay("Loading village data…");
		const selected = server;
		await request("SELECT_SERVER", { url: selected });
		if (selected === server) await loadServerData();
	}
	async function loadServerData() {
		if (!server) return;
		const selected = server,
			version = ++readVersion;
		const stored = await api.storage.local.get([
			storageKey(selected),
			targetCpKey(selected),
		]);
		if (selected !== server || version !== readVersion) return;
		data = stored[storageKey(selected)] || null;
		if (!data) {
			clearDisplay("Open Village Overview → Culture Points to load data.");
			return;
		}
		data.villages = Array.isArray(data.villages)
			? data.villages.filter(Boolean)
			: [];
		dom["speed-display"].textContent = normalizeSpeed(data.speed);
		dom.targetSlot.disabled =
			!Number.isFinite(data.totalCp) || !data.lastUpdate;
		setupTarget(stored[targetCpKey(selected)]);
		renderVillages();
		calculate();
	}
	function setupTarget(saved) {
		const thresholds = CP_REQUIREMENTS[normalizeSpeed(data.speed)].slice(1);
		const selected = thresholds.includes(Number(saved))
			? Number(saved)
			: thresholds.find((cp) => cp > nonNegative(data.totalCp)) ||
				thresholds.at(-1);
		dom.targetSlot.replaceChildren(
			...thresholds.map((cp, index) => {
				const option = make(
					"option",
					"",
					`Vil ${index + 2}: ${cp.toLocaleString()}`,
				);
				option.value = cp;
				return option;
			}),
		);
		dom.targetSlot.value = selected;
		if (Number(saved) !== selected && !dom.targetSlot.disabled)
			request("SET_TARGET", { url: server, target: selected }).catch(report);
	}
	function renderVillages() {
		if (!data) return;
		const signature = JSON.stringify(data.villages);
		if (signature === villageSignature) return;
		const focused = dom.villageList.contains(document.activeElement)
			? document.activeElement
			: null;
		const focusedId = focused?.closest(".v-row")?.dataset.villageId;
		const focusedClass = [
			"th-input",
			"th-inc",
			"th-dec",
			"sc-check",
			"lc-check",
		].find((cls) => focused?.classList.contains(cls));
		const draftLevel = focusedClass === "th-input" ? focused.value : null;
		villageSignature = signature;
		const rows = data.villages.map((village) => {
			const row = make("div", "v-row");
			row.dataset.villageId = String(village.id || village.name);
			const name = make("div", "v-name");
			name.title = village.name;
			name.append(
				document.createTextNode(village.name || "Unnamed village"),
				make("span", "timer-tag"),
				make("br"),
				make(
					"span",
					"v-prod",
					`${nonNegative(village.cpProduction).toLocaleString()} CP/d`,
				),
			);
			const thCell = make("div", "v-set"),
				stepper = make("div", "th-stepper");
			const input = make("input", "th-input");
			input.type = "number";
			input.min = 1;
			input.max = 20;
			input.value = normalizeTownHall(village.townHall);
			input.setAttribute("aria-label", `Town hall level for ${village.name}`);
			const minus = make("button", "th-btn th-dec", "−"),
				plus = make("button", "th-btn th-inc", "+");
			minus.type = plus.type = "button";
			minus.setAttribute(
				"aria-label",
				`Lower town hall level for ${village.name}`,
			);
			plus.setAttribute(
				"aria-label",
				`Raise town hall level for ${village.name}`,
			);
			stepper.append(minus, input, plus);
			thCell.append(stepper);
			row.append(name, thCell);
			for (const [field, cls, label] of [
				["smallCel", "sc-check", "small"],
				["largeCel", "lc-check", "large"],
			]) {
				const cell = make("div", "v-set"),
					container = make("label", "check-container");
				const checkbox = make("input", cls);
				checkbox.type = "checkbox";
				checkbox.checked = !!village[field];
				checkbox.disabled =
					field === "largeCel" && normalizeTownHall(village.townHall) < 10;
				checkbox.setAttribute(
					"aria-label",
					`Queue repeated ${label} celebrations in ${village.name}`,
				);
				container.title = checkbox.disabled
					? "Requires town hall level 10"
					: `Queue repeated ${label} celebrations`;
				container.append(checkbox, make("span", `checkmark ${label}`));
				cell.append(container);
				row.append(cell);
			}
			return row;
		});
		dom.villageList.replaceChildren(
			...(rows.length
				? rows
				: [
						make(
							"div",
							"empty-state",
							"Open Village Overview → Culture Points to load villages.",
						),
					]),
		);
		if (focusedClass) {
			const control = rows
				.find((row) => row.dataset.villageId === focusedId)
				?.querySelector(`.${focusedClass}`);
			if (control) {
				if (draftLevel !== null) control.value = draftLevel;
				control.focus();
			}
		}
	}
	async function editVillage(id, updates) {
		if (!server || !data) return;
		const selected = server;
		data = updateVillage(data, id, updates);
		renderVillages();
		calculate();
		try {
			await request("UPDATE_VILLAGE", { url: selected, id, updates });
		} catch (error) {
			report(error);
		}
		if (selected === server) await loadServerData();
	}
	function updateTimers(now) {
		const villages = new Map(
			(data?.villages || []).map((v) => [String(v.id || v.name), v]),
		);
		for (const row of dom.villageList.querySelectorAll(".v-row")) {
			const village = villages.get(row.dataset.villageId);
			if (!village) continue;
			const remaining = cooldownRemaining(
				village,
				now,
				(now - (data.lastUpdate || now)) / 1000,
			);
			const tag = row.querySelector(".timer-tag");
			if (village.smallCel && village.largeCel) {
				const first = cooldownRemaining(
					village,
					now,
					(now - (data.lastUpdate || now)) / 1000,
				);
				const smallDuration = TSP.getCelebrationDuration(
					"small",
					village.townHall,
					data.speed,
				);
				tag.hidden = false;
				tag.classList.toggle("done", first <= 0);
				tag.textContent = `Small: ${first > 0 ? formatHMS(Math.ceil(first)) : "now"} · Large: ${formatHMS(Math.ceil(first + smallDuration))}`;
				tag.title = "Small starts first; Large starts when Small finishes";
				continue;
			}
			tag.hidden = !village.cooldownEndsAt && !village.timerSeconds;
			tag.classList.toggle("done", remaining <= 0);
			tag.textContent =
				remaining > 0 ? ` ⏱ ${formatHMS(Math.ceil(remaining))}` : " Available";
		}
	}
	function calculate() {
		if (!data) return;
		const now = Date.now();
		updateTimers(now);
		if (dom.statusNote)
			dom.statusNote.textContent =
			errorMessage ||
				data.fetchError ||
				(data.lastUpdate && now - data.lastUpdate > 600000
					? "Using an older reading. Refresh to update the estimate."
					: "");
		if (!Number.isFinite(data.totalCp) || !data.lastUpdate) {
			dom.timeRemaining.textContent = "Need CP data";
			dom.targetDate.textContent = "Open your Travian statistics";
			targetDate = null;
			return;
		}
		const target = Number(dom.targetSlot.value);
		const inputs = forecastInputs(data, target, now);
		const result = predictSettlement(inputs);
		if (dom.forecastDetails) {
			const plans = data.villages.some((v) => v.smallCel || v.largeCel);
			if (dom.forecastLabel)
				dom.forecastLabel.textContent = plans
					? "With planned celebrations"
					: "At current production";
			const baseline = plans
				? predictSettlement({ ...inputs, villages: [] })
				: result;
			const details = [
				plans
					? `Without future parties: ${formatDuration(baseline.seconds)}`
					: "At the current production rate",
			];
			if (data.passiveAccel > 0 && result.seconds > 300) {
				const growth = predictSettlement({ ...inputs, useGrowthTrend: true });
				if (result.seconds - growth.seconds > 300)
					details.push(
						`If building growth continues: ${formatDuration(growth.seconds)}`,
					);
			}
			dom.forecastDetails.textContent = details.join("\n");
		}
		dom.cpDisplay.textContent = Math.floor(result.currentCp).toLocaleString();
		dom.totalProdDisplay.textContent = Math.round(
			result.ratePerDay,
		).toLocaleString();
		dom.progressFill.style.width = `${target ? Math.min(100, (result.currentCp / target) * 100) : 0}%`;
		if (result.currentCp >= target && target > 0) {
			dom.timeRemaining.textContent = "Ready!";
			dom.targetDate.textContent = "Right now";
			targetDate = null;
		} else if (result.seconds === 0 && target > 0) {
			dom.timeRemaining.textContent = "Ready with parties";
			dom.targetDate.textContent = "Start the planned celebrations";
			targetDate = null;
		} else if (!Number.isFinite(result.seconds) || !target) {
			dom.timeRemaining.textContent = "No forecast";
			dom.targetDate.textContent = "—";
			targetDate = null;
		} else {
			targetDate = new Date(now + result.seconds * 1000);
			dom.timeRemaining.textContent = formatDuration(result.seconds);
			dom.targetDate.textContent = Number.isFinite(targetDate.getTime())
				? targetDate.toLocaleString([], {
						weekday: "short",
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})
				: "Beyond calendar range";
			if (!Number.isFinite(targetDate.getTime())) targetDate = null;
		}
		if (copyFeedbackUntil > now) dom.targetDate.textContent = copyFeedback;
	}
	async function refreshServers(servers) {
		if (refreshing || !servers.length) return;
		refreshing = true;
		errorMessage = "";
		dom.refreshIndicator.classList.add("active");
		dom.refreshIndicator.disabled = true;
		try {
			const results = await Promise.allSettled(
				servers.map((url) => request("FORCE_FETCH", { url })),
			);
			const selected = results[servers.indexOf(server)];
			if (selected?.status === "rejected") report(selected.reason);
		} finally {
			refreshing = false;
			dom.refreshIndicator.classList.remove("active");
			dom.refreshIndicator.disabled = false;
			await loadServerData();
		}
	}
	async function copyTime() {
		if (!targetDate || targetDate.getTime() <= Date.now()) return;
		try {
			await navigator.clipboard.writeText(
				formatHMS((targetDate.getTime() - Date.now()) / 1000),
			);
			copyFeedback = "Copied!";
		} catch {
			copyFeedback = "Could not copy";
		}
		copyFeedbackUntil = Date.now() + 1500;
		calculate();
	}
	/** Download the forecast history so the model can be checked offline. */
	async function exportLog() {
		if (!server) return;
		const selected = server;
		const stored = await api.storage.local.get([
			logKey(selected),
			storageKey(selected),
			targetCpKey(selected),
		]);
		const entries = stored[logKey(selected)] || [];
		const file = {
			kind: "tsp-forecast-log",
			format: 1,
			server: selected,
			exportedAt: Date.now(),
			extensionVersion: api.runtime.getManifest?.().version,
			target: stored[targetCpKey(selected)],
			current: stored[storageKey(selected)],
			entries,
		};
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(file)], { type: "application/json" }),
		);
		const link = make("a");
		link.href = url;
		link.download = `cp-forecast-${new URL(selected).hostname}-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		copyFeedback = entries.length
			? `Exported ${entries.length} entries`
			: "No log entries yet";
		copyFeedbackUntil = Date.now() + 1500;
		calculate();
	}
	document.addEventListener("DOMContentLoaded", async () => {
		for (const id of [
			"serverSelect",
			"speed-display",
			"cpDisplay",
			"targetSlot",
			"timeRemaining",
			"targetDate",
			"totalProdDisplay",
			"villageList",
			"alarmToggle",
			"exportLog",
			"dateRow",
			"refreshIndicator",
			"progressFill",
			"statusNote",
			"forecastDetails",
			"forecastLabel",
		])
			dom[id] = document.getElementById(id);
		try {
			const meta = await api.storage.local.get([
				"tsp_servers",
				"tsp_last_viewed",
				"tsp_is_muted",
				"tsp_zoom",
			]);
			const servers = (
				Array.isArray(meta.tsp_servers) ? meta.tsp_servers : []
			).filter(serverOrigin);
			muted = !!meta.tsp_is_muted;
			updateMuteIcon();
			zoom = Math.max(0.5, Math.min(2, nonNegative(meta.tsp_zoom, 1) || 1));
			applyZoom();
			const tabs = await api.tabs.query({ active: true, currentWindow: true });
			const active = serverOrigin(tabs[0]?.url);
			server = servers.includes(active)
				? active
				: servers.includes(meta.tsp_last_viewed)
					? meta.tsp_last_viewed
					: servers[0] || null;
			dom.serverSelect.replaceChildren(
				...servers.map((origin) => {
					const opt = make("option", "", new URL(origin).hostname);
					opt.value = origin;
					return opt;
				}),
			);
			dom.serverSelect.style.display = servers.length > 1 ? "block" : "none";
			dom.serverSelect.value = server || "";
			dom.serverSelect.addEventListener("change", (event) =>
				selectServer(event.target.value).catch(report),
			);
			api.storage.onChanged.addListener((changes, area) => {
				if (area !== "local") return;
				if (changes.tsp_is_muted) {
					muted = !!changes.tsp_is_muted.newValue;
					updateMuteIcon();
				}
				if (
					server &&
					(changes[storageKey(server)] || changes[targetCpKey(server)])
				)
					loadServerData().catch(report);
			});
			dom.targetSlot.addEventListener("change", () => {
				request("SET_TARGET", {
					url: server,
					target: Number(dom.targetSlot.value),
				}).catch(report);
				calculate();
			});
			dom.alarmToggle.addEventListener("click", () => {
				muted = !muted;
				updateMuteIcon();
				request("SET_MUTED", { muted }).catch(report);
			});
			dom.exportLog.addEventListener("click", () => exportLog().catch(report));
			dom.dateRow.addEventListener("click", copyTime);
			dom.dateRow.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					copyTime();
				}
			});
			dom.refreshIndicator.title = "Refresh CP data";
			dom.refreshIndicator.addEventListener("click", () =>
				refreshServers(server ? [server] : []).catch(report),
			);
			dom.villageList.addEventListener("change", (event) => {
				const row = event.target.closest(".v-row");
				if (!row) return;
				let updates;
				if (event.target.classList.contains("th-input")) {
					event.target.value = normalizeTownHall(event.target.value);
					updates = { townHall: Number(event.target.value) };
				} else if (event.target.classList.contains("sc-check"))
					updates = { smallCel: event.target.checked };
				else if (event.target.classList.contains("lc-check"))
					updates = { largeCel: event.target.checked };
				if (updates) editVillage(row.dataset.villageId, updates).catch(report);
			});
			dom.villageList.addEventListener("click", (event) => {
				const button = event.target.closest(".th-btn");
				if (!button) return;
				const row = button.closest(".v-row"),
					input = row.querySelector(".th-input");
				const townHall = normalizeTownHall(
					Number(input.value) + (button.classList.contains("th-inc") ? 1 : -1),
				);
				input.value = townHall;
				editVillage(row.dataset.villageId, { townHall }).catch(report);
			});
			dom.villageList.addEventListener("focusout", () =>
				queueMicrotask(() => {
					renderVillages();
					calculate();
				}),
			);
			document.addEventListener(
				"wheel",
				(event) => {
					if (event.ctrlKey || event.metaKey) {
						event.preventDefault();
						changeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
					}
				},
				{ passive: false },
			);
			document.addEventListener("keydown", (event) => {
				if (
					!(event.ctrlKey || event.metaKey) ||
					!["+", "=", "-", "0"].includes(event.key)
				)
					return;
				event.preventDefault();
				changeZoom(
					event.key === "0" ? 1 : zoom + (event.key === "-" ? -0.1 : 0.1),
				);
			});
			if (server) {
				await selectServer(server);
				refreshServers(servers).catch(report);
			} else
				clearDisplay(
					"Open a Travian game page to start tracking culture points.",
				);
			interval = setInterval(calculate, 1000);
		} catch (error) {
			report(error);
		}
	});
	window.addEventListener("pagehide", () => clearInterval(interval));
})();
