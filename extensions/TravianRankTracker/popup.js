/**
 * Travian Rank Tracker — Popup UI (v5.0)
 *
 * This file drives the extension popup: the "Current" tab (live stats) and
 * the "History" tab (interactive graph).
 *
 * v5.0 changes:
 *   - Replaced duplicated fetch logic with shared `fetchAllEndpoints()`.
 *   - Surfacing background-fetch diagnostic status (e.g. "session expired").
 *   - Extracted repeated patterns into small helpers.
 *   - Added JSDoc comments throughout.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   §0  MODULE STATE
   ═══════════════════════════════════════════════════════════════════════ */

/** Whether the graph should display hourly velocity instead of absolute values. */
let isVelocityMode = false;

/** Chrome extension API namespace. */
const api = chrome;

/**
 * Snapshot of the stats captured the last time the popup was opened, used as
 * the baseline for the "since last open" leading delta. Refreshed on a 5-min
 * cooldown (see {@link BASELINE_COOLDOWN_MS}) — reopening within the cooldown
 * keeps the same comparison point so the delta keeps accumulating.
 */
let baselineSnapshot = null;
let activeServerOrigin = null;

/** Whether the baseline's cooldown has elapsed and it should be re-pinned. */
let baselineExpired = false;

/** Cooldown before the "since last open" baseline re-captures. */
const BASELINE_COOLDOWN_MS = 5 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════════════════
   §1  ENTRY POINT
   ═══════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", async () => {
	setupTabs();
	initBackupRestore();
	initRankInfoModal();
	initVelocityToggle();

	// Import workaround: if opened as a tab with ?action=import, auto-click file input
	if (new URLSearchParams(window.location.search).get("action") === "import") {
		setTimeout(() => document.getElementById("file-input")?.click(), 500);
		return; // Restore must not race this page's startup collection.
	}

	// ── Load persisted preferences ──
	const storageRes = await api.storage.local.get([
		"serverUrl",
		"serverUrls",
		"velocityMode",
		"appZoom",
	]);
	let serverOrigin = isTravianOrigin(storageRes.serverUrl) ? storageRes.serverUrl : null;

	initZoomControls(storageRes.appZoom);

	if (storageRes.velocityMode !== undefined) {
		isVelocityMode = storageRes.velocityMode;
		updateVelocityButtonUI();
	}

	// ── Detect active Travian tab ──
	const tabs = await api.tabs.query({ active: true, currentWindow: true });
	const tab = tabs[0];
	let isTravianTab = false;

	if (
		tab?.url &&
		(tab.url.includes("travian.") || tab.url.includes("travian-"))
	) {
		try {
			const urlObj = new URL(tab.url);
			if (
				isTravianOrigin(urlObj.origin)
			) {
				serverOrigin = urlObj.origin;
				const knownServers =
					storageRes.serverUrls ||
					(storageRes.serverUrl ? [storageRes.serverUrl] : []);
				if (!knownServers.includes(serverOrigin))
					knownServers.push(serverOrigin);
				await api.storage.local.set({
					serverUrl: serverOrigin,
					serverUrls: knownServers,
				});
				isTravianTab = true;
			}
		} catch (_) {}
	}

	// ── Kick off data loading ──
	if (!serverOrigin) {
		document
			.querySelectorAll(".loading")
			.forEach(
				(el) =>
					(el.innerText = "Please open Travian once to set up the tracker."),
			);
		return;
	}

	activeServerOrigin = serverOrigin;
	const storageKey = `history_${serverOrigin}`;

	// ── Load "since last open" baseline (5-min cooldown) ──
	const baselineKey = `baseline_${serverOrigin}`;
	const baselineRes = await api.storage.local.get([baselineKey]);
	const storedBaseline = baselineRes[baselineKey];
	if (storedBaseline && storedBaseline.timestamp != null) {
		baselineSnapshot = storedBaseline.data || null;
		baselineExpired =
			Date.now() - storedBaseline.timestamp >= BASELINE_COOLDOWN_MS;
	} else {
		baselineSnapshot = null;
		baselineExpired = true; // no baseline yet → capture one this open
	}

	setUpdateStatus("(Updating...)");

	// Show cached data immediately
	await loadFromStorage(storageKey, serverOrigin);

	// If History tab is already visible, render graph
	if (!document.getElementById("view-hist")?.classList.contains("hidden")) {
		loadGraph("all", storageKey);
	}

	// Fresh fetch
	if (isTravianTab && ["/statistics/general", "/statistics/player/top10"].includes(new URL(tab.url).pathname)) {
		await scrapeActiveScreen(tab.id, serverOrigin, storageKey, new URL(tab.url).pathname === "/statistics/player/top10");
	} else {
		await fetchAndRender(serverOrigin, storageKey);
	}

	await updatePlaytime(serverOrigin);

});

/**
 * Wire up the rank-tier info modal triggered from the header icon.
 */
function initRankInfoModal() {
	const btn = document.getElementById("btn-rank-info");
	const modal = document.getElementById("rank-info-modal");
	const close = document.getElementById("btn-close-rank-info");
	if (!btn || !modal || !close) return;

	btn.addEventListener("click", () => modal.classList.remove("hidden"));
	close.addEventListener("click", () => modal.classList.add("hidden"));
}

/* ═══════════════════════════════════════════════════════════════════════════
   §2  ZOOM CONTROLS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Wire up Ctrl+Scroll and Ctrl+/- for popup-level zoom, persisted to storage.
 */
function initZoomControls(savedZoom) {
	if (savedZoom) document.body.style.zoom = savedZoom;

	const setAppZoom = async (newZoom) => {
		newZoom = Math.max(0.5, Math.min(Math.round(newZoom * 10) / 10, 2.0));
		document.body.style.zoom = newZoom;
		await api.storage.local.set({ appZoom: newZoom });
	};

	window.addEventListener(
		"wheel",
		(e) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			const current = parseFloat(document.body.style.zoom) || 1.0;
			setAppZoom(e.deltaY < 0 ? current + 0.1 : current - 0.1);
		},
		{ passive: false },
	);

	window.addEventListener("keydown", (e) => {
		if (!e.ctrlKey) return;
		const current = parseFloat(document.body.style.zoom) || 1.0;
		if (e.key === "=" || e.key === "+") {
			e.preventDefault();
			setAppZoom(current + 0.1);
		} else if (e.key === "-") {
			e.preventDefault();
			setAppZoom(current - 0.1);
		} else if (e.key === "0") {
			e.preventDefault();
			setAppZoom(1.0);
		}
	});
}

/* ═══════════════════════════════════════════════════════════════════════════
   §3  DATA FETCHING
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Update the small status text next to the header buttons.
 */
function setUpdateStatus(text) {
	const el = document.getElementById("last-update");
	if (el) el.innerText = text;
}

/**
 * Render the playtime label: elapsed time since the game started on this
 * server, anchored to the received-time of the first Travian system message
 * in the inbox (`gameStart_{origin}`, fetched once via fetchGameStart).
 * Falls back to the never-trimmed `firstSeen_{origin}` anchor, then to the
 * oldest retained history entry. Hidden when unknown.
 */
async function updatePlaytime(serverOrigin) {
	const el = document.getElementById("playtime");
	if (!el || !serverOrigin) return;

	const gameStartKey = `gameStart_${serverOrigin}`;
	const firstSeenKey = `firstSeen_${serverOrigin}`;
	const histKey = `history_${serverOrigin}`;
	const res = await api.storage.local.get([gameStartKey, firstSeenKey, histKey]);

	let anchor = res[gameStartKey];
	if (anchor == null) anchor = await fetchGameStart(serverOrigin, api);
	if (anchor == null) anchor = res[firstSeenKey];
	if (anchor == null) {
		const hist = res[histKey] || [];
		anchor = hist.length > 0 ? hist[0].timestamp : null;
	}

	if (anchor == null) {
		el.textContent = "";
		return;
	}
	const elapsed = Date.now() - anchor;
	const totalHours = Math.floor(elapsed / 3600000);
	el.textContent = `⏱ ${formatDuration(elapsed)} (${totalHours}h)`;
}

/**
 * Re-pin the "since last open" baseline to the freshest data, but only if its
 * cooldown has elapsed (or no baseline existed). Called after a successful
 * fresh fetch so the displayed delta — which uses the baseline captured at the
 * start of this open — is unaffected within the same popup session.
 */
async function maybeUpdateBaseline(serverOrigin, data) {
	if (!serverOrigin || !data || !baselineExpired) return;
	const baselineKey = `baseline_${serverOrigin}`;
	await api.storage.local.set({
		[baselineKey]: { timestamp: Date.now(), data },
	});
	baselineExpired = false;
}

/**
 * Fetch data using the shared `fetchAllEndpoints()` and render the UI.
 * This replaces the old duplicated `fetchData()` function.
 */
async function fetchAndRender(serverOrigin, storageKey) {
	const { data, status } = await fetchAllEndpoints(
		serverOrigin,
		api,
		storageKey,
	);

	if (status === "logged_out") {
		setUpdateStatus("Session expired");
		document.getElementById("stats-list").innerHTML =
			'<div class="error">Session expired — please log in to Travian</div>';
		return;
	}
	if (status === "fetch_error" || !data) {
		setUpdateStatus("Update failed");
		document.getElementById("stats-list").innerHTML =
			'<div class="error">Could not connect to server</div>';
		return;
	}

	const histRes = await api.storage.local.get([storageKey]);
	renderUI(data, histRes[storageKey] || []);
	await maybeUpdateBaseline(serverOrigin, data);
}

/**
 * When the popup opens on a /statistics page, scrape the DOM directly from
 * the active tab instead of making separate HTTP requests.
 */
async function scrapeActiveScreen(tabId, serverOrigin, storageKey, weekly = false) {
	try {
		const result = await api.scripting.executeScript({
			target: { tabId },
			func: () => document.documentElement.outerHTML,
		});

		if (!result?.[0]) throw new Error("Empty script result");

		const mergedData = await processHtmlData(
			result[0].result, api, serverOrigin, storageKey, false, weekly,
		);

		await maybeUpdateBaseline(serverOrigin, mergedData);
	} catch (_) {
		// Fallback to network fetch if scripting fails
		await fetchAndRender(serverOrigin, storageKey);
	}
}

/**
 * Load the most recent snapshot from storage and render immediately (no network).
 * History is left intact, including both sides of counter resets.
 */
async function loadFromStorage(storageKey, serverOrigin) {
	if (!storageKey) return;

	const latestKey = `latest_${serverOrigin}`;
	const res = await api.storage.local.get([storageKey, latestKey]);
	let hist = res[storageKey] || [];

	// Reading history must not erase observations around counter resets.

	const data =
		res[latestKey] || (hist.length > 0 ? hist[hist.length - 1] : { top10: [] });
	if (data.timestamp) renderUI(data, hist);

}

/* ═══════════════════════════════════════════════════════════════════════════
   §4  CURRENT-TAB RENDERING
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Find the history entry closest to `targetTime`.
 */
function getHistoryPoint(history, targetTime) {
	if (!history?.length || targetTime < history.reduce((oldest, point) => Math.min(oldest, point.timestamp), Infinity)) return null;
	let closest = null;
	let minDiff = Infinity;
	for (const item of history) {
		const diff = Math.abs(item.timestamp - targetTime);
		if (diff < minDiff) {
			minDiff = diff;
			closest = item;
		}
	}
	return closest;
}

/**
 * Render the "Current" tab with live stats and delta comparisons.
 */
function renderUI(data, history) {
	if (!data) return;

	const now = Date.now();

	// Rolling time offsets for General Rankings
	const offsets = {
		h1: now - 1 * 60 * 60 * 1000,
		h3: now - 3 * 60 * 60 * 1000,
		day: now - 24 * 60 * 60 * 1000,
		week: now - 7 * 24 * 60 * 60 * 1000,
	};

	// History reference points
	const h1 = getHistoryPoint(history, offsets.h1);
	const h3 = getHistoryPoint(history, offsets.h3);
	const hD = getHistoryPoint(history, offsets.day);
	const hW = getHistoryPoint(history, offsets.week);
	const weeklyHistory = history.filter((point) => point.top10?.length);

	// ── Diff row builder ──

	/**
	 * Build the small delta-row HTML for a single stat.
	 *
	 * @param {number} currRank   - Current rank value.
	 * @param {number} currVal    - Current absolute value (may be null).
	 * @param {string} keyRank    - Property name for rank in history objects.
	 * @param {string} keyVal     - Property name for value in history objects.
	 * @param {boolean} isTop10   - Whether this stat comes from the Top-10 section.
	 * @param {string}  label     - Top-10 label for cross-referencing.
	 */
	const getDiffRow = (
		currRank,
		currVal,
		keyRank,
		keyVal,
		isTop10 = false,
		label = "",
	) => {
		const getOld = (snapshot) => ({
			r: isTop10
				? snapshot?.top10?.find((item) => item.label === label)?.rank
				: snapshot?.[keyRank],
			v: isTop10 ? top10Value(snapshot, label) : snapshot?.[keyVal],
			snapshot,
		});

		const refs = [
			{ tag: "1h", obj: getOld(isTop10 ? getHistoryPoint(weeklyHistory, offsets.h1) : h1) },
			{ tag: "3h", obj: getOld(isTop10 ? getHistoryPoint(weeklyHistory, offsets.h3) : h3) },
			{ tag: "D", obj: getOld(isTop10 ? getHistoryPoint(weeklyHistory, offsets.day) : hD) },
			{ tag: "W", obj: getOld(isTop10 ? getHistoryPoint(weeklyHistory, offsets.week) : hW) },
		];

		const fmt = (curr, oldObj, isRank) => {
			const oldVal = isRank ? oldObj.r : oldObj.v;
			if (curr == null || oldVal == null)
				return '<span style="color:#444">-</span>';

			let diff = curr - oldVal;
			if (isTop10 && !isRank) {
				const start = oldObj.snapshot;
				if (!Number.isFinite(start?.timestamp) || !Number.isFinite(data.timestamp) || start.timestamp > data.timestamp)
					return '<span style="color:#444">-</span>';
				const samples = [start, ...history
					.filter((point) => point.timestamp > start.timestamp && point.timestamp < data.timestamp)
					.sort((a, b) => a.timestamp - b.timestamp), data];
				const totals = counterTotals(samples, (point) => top10Value(point, label));
				if (totals[0] == null || totals[totals.length - 1] == null)
					return '<span style="color:#444">-</span>';
				diff = totals[totals.length - 1] - totals[0];
			}

			if (diff === 0) return '<span style="color:#444">=</span>';
			const positive = isRank ? diff < 0 : diff > 0; // lower rank = better
			const color = positive ? "#71d000" : "#d9534f";
			return `<span style="color:${color}">${diff > 0 ? "+" : ""}${diff.toLocaleString()}</span>`;
		};

		// ── Leading "since last open" delta (baseline on a 5-min cooldown) ──
		const baseOld = getOld(baselineSnapshot);
		const lead = (inner) =>
			`<span class="lead-diff" title="Change since last popup open (refreshes every 5 min)">${inner}</span>`;
		const leadRank = lead(fmt(currRank, baseOld, true));
		const leadVal = currVal != null ? lead(fmt(currVal, baseOld, false)) : "";

		const rankParts = refs
			.map(({ tag, obj }) => `${tag} ${fmt(currRank, obj, true)}`)
			.join(" ");

		let valParts = "";
		if (currVal != null) {
			valParts =
				`&nbsp; &nbsp; | &nbsp; &nbsp;${leadVal} Val: ` +
				refs
					.map(({ tag, obj }) => `${tag} ${fmt(currVal, obj, false)}`)
					.join(" ");
		}

		return `<div class="diff-row">${leadRank} Rk: ${rankParts}${valParts}</div>`;
	};

	// ── Top 10 section ──

	const displayTop10 = data.top10 || [];
	let topHtml = "";

	// Look up raw animal-kill count + raw raided-resources for derivations
	const pveItem = displayTop10.find((i) => i.label === "PvE of the week");
	const robItem = displayTop10.find((i) => i.label === "Robbers of the week");
	const pveKills = pveItem ? cleanSmartNum(pveItem.val) : null;
	const robRaw = robItem ? cleanSmartNum(robItem.val) : null;
	const pveResources = pveKills != null ? pveKills * 160 : null;
	const robExcludingPve =
		robRaw != null && pveResources != null ? robRaw - pveResources : null;

	if (displayTop10.length > 0) {
		for (let idx = 0; idx < displayTop10.length; idx++) {
			const item = displayTop10[idx];
			const valClean = cleanSmartNum(item.val);
			let valDisp = item.val ? item.val.toLocaleString() : "0";

			// Derived display: "kills / kills*160"
			if (item.label === "PvE of the week" && pveResources != null) {
				valDisp = `${valClean.toLocaleString()} / ${pveResources.toLocaleString()}`;
			}
			// Derived display: "raided_excluding_pve / raw_raided"
			if (
				item.label === "Robbers of the week" &&
				robExcludingPve != null &&
				robRaw != null
			) {
				valDisp = `${robExcludingPve.toLocaleString()} / ${robRaw.toLocaleString()}`;
			}

			const isLast = idx === displayTop10.length - 1;
			const tier = getRankTier(item.rank, data.totalPlayers);
			const rankClass = tier.isTop10
				? "rank-top10"
				: tier.isImmortal
					? "rank-immortal"
					: "";
			const rankStyle = tier.isTop10 ? "" : `color:${tier.color};`;

			topHtml += `
                <div>
                    <div class="stat-row stat-row--flat">
                        <span class="label">${item.label}</span>
                        <span>
                            <span class="${rankClass}" style="${rankStyle}font-weight:bold;">#${item.rank}</span>
                            <span class="val val-sub">(${valDisp})</span>
                        </span>
                    </div>
                    ${getDiffRow(item.rank, valClean, null, null, true, item.label)}
                </div>
                ${isLast ? "" : '<div class="stat-separator"></div>'}`;
		}
	} else {
		topHtml = '<div class="loading">No Top 10 Data</div>';
	}
	document.getElementById("top10-list").innerHTML = topHtml;
	document.getElementById("top10-list").title = data.weeklyTimestamp
		? `Weekly data observed: ${new Date(data.weeklyTimestamp).toLocaleString()}` : "";

	// ── General Rankings section ──

	let genHtml = "";
	const addGen = (label, rank, points, keyRank, keyPoints, displayOverride) => {
		const tier = getRankTier(rank, data.totalPlayers);
		const rankClass = tier.isTop10
			? "rank-top10"
			: tier.isImmortal
				? "rank-immortal"
				: "val";
		const rankStyle = tier.isTop10 || !rank ? "" : `color:${tier.color};`;
		const valDisp = displayOverride
			? ` <span class="val val-sub">(${displayOverride})</span>`
			: points != null
				? ` <span class="val val-sub">(${points.toLocaleString()})</span>`
				: "";
		genHtml += `
            <div>
                <div class="stat-row stat-row--flat">
                    <span class="label">${label}</span>
                    <span><span class="${rankClass}" style="${rankStyle}font-weight:bold;">#${rank || "-"}</span>${valDisp}</span>
                </div>
                ${getDiffRow(rank, points, keyRank, keyPoints)}
            </div>
            <div class="stat-separator"></div>
        `;
	};

	addGen("Population", data.rankPop, data.valPop, "rankPop", "valPop");
	addGen("Prod / Hour", data.rankProd, data.valProd, "rankProd", "valProd");
	const prodSoFarDisplay =
		data.valBounty != null && data.valProdSoFar != null
			? `${data.valBounty.toLocaleString()} / ${data.valProdSoFar.toLocaleString()}`
			: null;
	addGen(
		"Prod So Far",
		data.rankProdSoFar,
		data.valProdSoFar,
		"rankProdSoFar",
		"valProdSoFar",
		prodSoFarDisplay,
	);
	addGen("CP / Day", data.rankCp, data.cpProd, "rankCp", "cpProd");
	addGen(
		"CP So Far",
		data.rankCpSoFar,
		data.valCpSoFar,
		"rankCpSoFar",
		"valCpSoFar",
	);
	addGen(
		"Offensive Strength",
		data.rankOff,
		data.pointsOff,
		"rankOff",
		"pointsOff",
	);
	addGen(
		"Defensive Strength",
		data.rankDef,
		data.pointsDef,
		"rankDef",
		"pointsDef",
	);

	// ── Average Rank ──
	// Only the ranks that appear in the in-game general rankings table
	// (the .rankDisplay badges scraped in utils.js). The cumulative
	// "Prod So Far" / "CP So Far" ranks come from the React data only and
	// are deliberately excluded from the average.
	const GEN_RANK_KEYS = [
		"rankPop",
		"rankProd",
		"rankCp",
		"rankOff",
		"rankDef",
	];

	const calcAvgRank = (obj) => {
		if (!obj) return null;
		const vals = GEN_RANK_KEYS.map((k) => obj[k]).filter((r) => Number.isFinite(r) && r > 0);
		return vals.length > 0
			? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
			: null;
	};

	const avg = calcAvgRank(data);

	if (avg != null) {
		const avgTier = getRankTier(avg, data.totalPlayers);
		const avgClass = avgTier.isTop10
			? "rank-top10"
			: avgTier.isImmortal
				? "rank-immortal"
				: "val";
		const avgStyle = avgTier.isTop10 ? "" : `color:${avgTier.color};`;
		genHtml += `
			<div class="stat-row avg-rank-row">
				<span class="label">Avg Rank</span>
				<span class="${avgClass}" style="${avgStyle}font-weight:bold;">#${avg}</span>
			</div>`;

		// Avg rank deltas
		const refs = [
			{ tag: "1h", val: calcAvgRank(h1) },
			{ tag: "3h", val: calcAvgRank(h3) },
			{ tag: "D", val: calcAvgRank(hD) },
			{ tag: "W", val: calcAvgRank(hW) },
		];
		const parts = refs
			.map(({ tag, val }) => {
				if (val == null) return `${tag} <span style="color:#444">-</span>`;
				const diff = avg - val;
				if (diff === 0) return `${tag} <span style="color:#444">=</span>`;
				const color = diff < 0 ? "#71d000" : "#d9534f";
				return `${tag} <span style="color:${color}">${diff > 0 ? "+" : ""}${diff}</span>`;
			})
			.join(" ");

		// Leading "since last open" delta for the average rank
		const baseAvg = calcAvgRank(baselineSnapshot);
		let avgLead = '<span style="color:#444">-</span>';
		if (baseAvg != null) {
			const d = avg - baseAvg;
			if (d === 0) avgLead = '<span style="color:#444">=</span>';
			else {
				const c = d < 0 ? "#71d000" : "#d9534f";
				avgLead = `<span style="color:${c}">${d > 0 ? "+" : ""}${d}</span>`;
			}
		}
		genHtml += `<div class="diff-row"><span class="lead-diff" title="Change since last popup open (refreshes every 5 min)">${avgLead}</span> Rk: ${parts}</div>`;
	}

	const apEl = document.getElementById("active-players");
	if (apEl) {
		apEl.textContent =
			data.totalPlayers != null
				? `👥 ${data.totalPlayers.toLocaleString()}`
				: "";
	}

	document.getElementById("stats-list").innerHTML = genHtml;

	if (data.timestamp) {
		setUpdateStatus(
			`Updated: ${new Date(data.timestamp).toLocaleTimeString()}`,
		);
	}
}

/* ═══════════════════════════════════════════════════════════════════════════
   §5  TAB NAVIGATION
   ═══════════════════════════════════════════════════════════════════════ */

function setupTabs() {
	const tabCurr = document.getElementById("tab-curr");
	const tabHist = document.getElementById("tab-hist");
	const viewCurr = document.getElementById("view-curr");
	const viewHist = document.getElementById("view-hist");

	// ── Current tab ──
	tabCurr.onclick = async () => {
		tabCurr.classList.add("active");
		tabHist.classList.remove("active");
		viewCurr.classList.remove("hidden");
		viewHist.classList.add("hidden");

		setUpdateStatus("(Updating...)");

		const prefs = { serverUrl: activeServerOrigin };
		if (!prefs.serverUrl) return;

		const tabs = await api.tabs.query({ active: true, currentWindow: true });
		const tab = tabs[0];
		const storageKey = `history_${prefs.serverUrl}`;

		if (
			tab?.url && ["/statistics/general", "/statistics/player/top10"].includes(new URL(tab.url).pathname) &&
			new URL(tab.url).origin === prefs.serverUrl
		) {
			await scrapeActiveScreen(tab.id, prefs.serverUrl, storageKey, new URL(tab.url).pathname === "/statistics/player/top10");
		} else {
			await fetchAndRender(prefs.serverUrl, storageKey);
		}
	};

	// ── History tab ──
	tabHist.onclick = async () => {
		tabHist.classList.add("active");
		tabCurr.classList.remove("active");
		viewCurr.classList.add("hidden");
		viewHist.classList.remove("hidden");

		const prefs = await api.storage.local.get(["graphFilter"]);
		prefs.serverUrl = activeServerOrigin;
		const filter = prefs.graphFilter || "all";

		// Sync active state on filter buttons
		document.querySelectorAll(".c-btn").forEach((btn) => {
			if (btn.dataset.f === filter) btn.classList.add("active");
			else if (!["btn-velocity", "btn-zoom-reset"].includes(btn.id))
				btn.classList.remove("active");
		});

		if (prefs.serverUrl) loadGraph(filter, `history_${prefs.serverUrl}`);
	};

	// ── Filter buttons (Raw Data / Daily Peaks) ──
	document.querySelectorAll(".c-btn[data-f]").forEach((btn) => {
		btn.onclick = async () => {
			if (
				[
					"btn-backup",
					"btn-restore",
					"btn-velocity",
					"btn-zoom-reset",
				].includes(btn.id)
			)
				return;

			const filter = btn.dataset.f;
			await api.storage.local.remove("graphZoom");
			await api.storage.local.set({ graphFilter: filter });

			document.querySelectorAll(".c-btn").forEach((b) => {
				if (
					![
						"btn-backup",
						"btn-restore",
						"btn-velocity",
						"btn-zoom-reset",
					].includes(b.id)
				) {
					b.classList.remove("active");
				}
			});
			btn.classList.add("active");

			const prefs = { serverUrl: activeServerOrigin };
			if (prefs.serverUrl) loadGraph(filter, `history_${prefs.serverUrl}`);
		};
	});

	// ── Zoom Reset ──
	const zoomReset = document.getElementById("btn-zoom-reset");
	if (zoomReset) {
		zoomReset.onclick = async () => {
			if (!window.myChart) return;
			window.myChart.options.scales.x.min = undefined;
			window.myChart.options.scales.x.max = undefined;
			window.myChart.update();
			zoomReset.classList.add("hidden");
			await api.storage.local.remove("graphZoom");
		};
	}
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6  BACKUP & RESTORE
   ═══════════════════════════════════════════════════════════════════════ */

function validateBackup(data) {
	const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	const requireValid = (valid) => { if (!valid) throw new Error("Invalid backup"); };
	const origin = isTravianOrigin;
	const snapshot = (value) => {
		requireValid(object(value) && Number.isFinite(value.timestamp) && value.timestamp > 0 && value.timestamp <= 8.64e15);
		for (const [key, field] of Object.entries(value)) {
			if (key === "top10") {
				requireValid(Array.isArray(field));
				for (const item of field) requireValid(object(item) &&
					["PvP of the week", "Defenders of the week", "PvE of the week", "Robbers of the week"].includes(item.label) &&
					Number.isFinite(item.rank) && item.rank > 0 && (item.val == null || Number.isFinite(item.val)));
			} else requireValid(field == null || Number.isFinite(field));
		}
	};
	requireValid(object(data) && origin(data.serverUrl));
	let hasSnapshots = false;
	for (const [key, value] of Object.entries(data)) {
		const match = /^(history|latest|baseline|firstSeen|gameStart|lastFetchStatus)_(.+)$/.exec(key);
		if (match) {
			requireValid(origin(match[2]));
			if (match[1] === "history") {
				requireValid(Array.isArray(value));
				value.forEach(snapshot);
				hasSnapshots ||= value.length > 0;
			} else if (match[1] === "latest") { snapshot(value); hasSnapshots = true; }
			else if (match[1] === "baseline") {
				requireValid(object(value) && Number.isFinite(value.timestamp));
				snapshot(value.data);
			} else if (match[1] === "lastFetchStatus") requireValid(object(value) && Number.isFinite(value.timestamp) && typeof value.ok === "boolean" && typeof value.reason === "string");
			else requireValid(Number.isFinite(value) && value > 0);
		} else if (key === "serverUrls") requireValid(Array.isArray(value) && value.every(origin));
		else if (key === "velocityMode") requireValid(typeof value === "boolean");
		else if (key === "appZoom") requireValid(Number.isFinite(value) && value >= 0.5 && value <= 2);
		else if (key === "graphFilter") requireValid(["all", "daily"].includes(value));
		else if (key === "graphZoom") requireValid(object(value) && Object.values(value).every(Number.isFinite));
		else if (key === "graphPrefs") requireValid(object(value) && Object.values(value).every((item) => typeof item === "boolean"));
		else if (key === "customGroups") requireValid(object(value) && Object.values(value).every((items) => Array.isArray(items) && items.every((item) => typeof item === "string")));
	}
	requireValid(hasSnapshots);
}

function initBackupRestore() {
	document.getElementById("btn-backup")?.addEventListener("click", async () => {
		try {
			const allData = await api.storage.local.get(null);
			const json = JSON.stringify(allData, null, 2);
			const filename = `travian_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;

			// Firefox blocks programmatic <a download> clicks from extension popups.
			// Use the downloads API when available, fall back to blob URL for Chrome.
			if (api.downloads) {
				const blob = new Blob([json], { type: "application/json" });
				const blobUrl = URL.createObjectURL(blob);
				await api.downloads.download({ url: blobUrl, filename, saveAs: false });
				setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
			} else {
				const url = URL.createObjectURL(
					new Blob([json], { type: "application/json" }),
				);
				const a = Object.assign(document.createElement("a"), {
					href: url,
					download: filename,
				});
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		} catch {}
	});

	document
		.getElementById("btn-restore")
		?.addEventListener("click", async () => {
			// tabs.getCurrent is Promise-based in Firefox, callback-based in Chrome MV3+
			const currentTab = await api.tabs.getCurrent();
			if (currentTab) {
				document.getElementById("file-input").click();
			} else {
				api.tabs.create({
					url: api.runtime.getURL("popup.html?action=import"),
				});
			}
		});

	document.getElementById("file-input")?.addEventListener("change", (e) => {
		const file = e.target.files[0];
		if (!file) return;

		setUpdateStatus("(Restoring data...)");

		const reader = new FileReader();
		reader.onload = async (ev) => {
			try {
				const data = JSON.parse(ev.target.result);

				// Auto-detect serverUrl from history keys if missing
				if (!data.serverUrl) {
					const historyKey = Object.keys(data).find((k) =>
						k.startsWith("history_"),
					);
					if (historyKey) data.serverUrl = historyKey.replace("history_", "");
				}

				validateBackup(data);
				for (const [key, value] of Object.entries(data)) {
					if (!key.startsWith("history_")) continue;
					value.sort((a, b) => a.timestamp - b.timestamp);
				}
				for (const key of Object.keys(data)) if (key.startsWith("raidIncome_")) delete data[key];
				await navigator.locks.request("rank-tracker-storage", async () => {
					const previous = await api.storage.local.get(null);
					await api.storage.local.set(data);
					await api.storage.local.remove(Object.keys(previous).filter((key) => !(key in data)));
				});
				setUpdateStatus("✅ Data Restored!");
				setTimeout(() => (window.location.href = "popup.html"), 800);
			} catch {
				setUpdateStatus("Error: Invalid File");
			} finally {
				e.target.value = "";
			}
		};
		reader.onerror = () => setUpdateStatus("Error: Could not read file");
		reader.readAsText(file);
	});
}

/* ═══════════════════════════════════════════════════════════════════════════
   §7  VELOCITY MODE
   ═══════════════════════════════════════════════════════════════════════ */

function updateVelocityButtonUI() {
	const btn = document.getElementById("btn-velocity");
	if (!btn) return;
	btn.innerText = isVelocityMode ? "Avg / Hr" : "Actual";
	btn.classList.toggle("velocity-active", isVelocityMode);
}

function initVelocityToggle(serverOrigin) {
	const btn = document.getElementById("btn-velocity");
	if (!btn) return;

	btn.addEventListener("click", async () => {
		isVelocityMode = !isVelocityMode;
		await api.storage.local.set({ velocityMode: isVelocityMode });
		updateVelocityButtonUI();

		const prefs = await api.storage.local.get(["graphFilter"]);
		prefs.serverUrl = activeServerOrigin;
		const url = prefs.serverUrl || serverOrigin;
		if (url) loadGraph(prefs.graphFilter || "all", `history_${url}`);
	});
}

/* ═══════════════════════════════════════════════════════════════════════════
   §8  GRAPH — COMPARE BOX
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Render the drag-selection comparison overlay that shows deltas between
 * two points on the graph.
 */
function updateCompareBox(chart, startIdx, endIdx, timestamps) {
	const box = document.getElementById("compare-box");

	if (startIdx === null || endIdx === null || startIdx === endIdx) {
		box.style.opacity = "0";
		setTimeout(() => {
			if (box.style.opacity === "0") box.style.display = "none";
		}, 200);
		return;
	}

	box.style.display = "block";
	setTimeout(() => (box.style.opacity = "1"), 10);

	const i1 = Math.min(startIdx, endIdx);
	const i2 = Math.max(startIdx, endIdx);

	const timeDiffHours =
		timestamps?.[i1] && timestamps?.[i2]
			? Math.abs(timestamps[i2] - timestamps[i1]) / 3_600_000
			: 0;

	const labels = chart.data.labels;
	let html = `
        <div style="margin-bottom:10px; border-bottom:1px solid #444; padding-bottom:8px; font-size:12px; color:#eee; display:flex; justify-content:space-between; align-items:center;">
            <div><strong>${labels[i1]}</strong> <span style="color:#5bc0de; margin:0 6px;">&#8594;</span> <strong>${labels[i2]}</strong></div>
            ${
							timeDiffHours > 0 && !isVelocityMode
								? `<div style="font-size:10px; color:#aaa; background:#333; padding:2px 6px; border-radius:4px;">&#9202; ${Math.round(timeDiffHours * 10) / 10}h</div>`
								: ""
						}
        </div>`;

	let hasData = false;
	chart.data.datasets.forEach((ds, dsIndex) => {
		if (!chart.isDatasetVisible(dsIndex)) return;
		const values = ds.comparisonData || ds.data;
		const val1 = values[i1];
		const val2 = values[i2];
		if (val1 == null || val2 == null) return;

		const diff = val2 - val1;
		if (diff === 0) return;

		hasData = true;
		const isRank = ds.yAxisID === "y";
		const color =
			diff > 0
				? isRank
					? "#d9534f"
					: "#71d000"
				: isRank
					? "#71d000"
					: "#d9534f";
		const sign = diff > 0 ? "+" : "";

		let displayValue = `${sign}${diff.toLocaleString()}`;
		if (!isVelocityMode && timeDiffHours > 0) {
			const hourly = Math.round((diff / timeDiffHours) * 10) / 10;
			displayValue += ` <span style="color:#888; font-size:10px; margin-left:4px;">(${sign}${hourly.toLocaleString()}/h)</span>`;
		} else if (isVelocityMode) {
			displayValue += ` <span style="color:#888; font-size:10px; margin-left:4px;">/h</span>`;
		}

		html += `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:6px;">
                <div style="display:flex; align-items:center;">
                    <span style="width:8px; height:8px; border-radius:50%; background-color:${ds.borderColor}; margin-right:6px;"></span>
                    <span style="color:#bbb;">${ds.label}</span>
                </div>
                <span style="color:${color}; font-weight:600;">${displayValue}</span>
            </div>`;
	});

	if (!hasData) {
		html +=
			'<div style="font-size:11px; color:#777; text-align:center; padding:10px 0;">No changes in visible stats.</div>';
	}

	box.innerHTML = html;
	Object.assign(box.style, {
		transition: "opacity 0.2s ease-in-out",
		background: "rgba(24, 24, 24, 0.95)",
		border: "1px solid #444",
		boxShadow: "0 8px 16px rgba(0,0,0,0.6)",
		borderRadius: "8px",
		padding: "12px",
	});
}

/* ═══════════════════════════════════════════════════════════════════════════
   §9  GRAPH — MAIN RENDER
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Dataset configuration for the chart.  Centralised here so the chart
 * builder doesn't become an unreadable wall of objects.
 */
const DATASETS_CONFIG = [
	{
		key: "pointsOff",
		label: "Offensive Strength",
		color: "#ff8888",
		dash: [2, 2],
		axis: "y1",
		defHidden: true,
		ceil: true,
	},
	{
		key: "pointsDef",
		label: "Defensive Strength",
		color: "#88ff88",
		dash: [2, 2],
		axis: "y1",
		defHidden: true,
		ceil: true,
	},
	{
		key: "rankPvp",
		label: "Attacker of the week",
		color: "#d9534f",
		dash: null,
		axis: "y",
		defHidden: false,
	},
	{
		key: "rankDefTop",
		label: "Defenders of the week",
		color: "#71d000",
		dash: null,
		axis: "y",
		defHidden: false,
	},
	{
		key: "valRob",
		label: "Res Raided This Week",
		color: "#5bc0de",
		dash: [5, 5],
		axis: "y1",
		defHidden: false,
	},
	{
		key: "rankRob",
		label: "Robbers of the week",
		color: "#337ab7",
		dash: null,
		axis: "y",
		defHidden: true,
	},
	{
		key: "valPve",
		label: "Animals Killed",
		color: "#f0ad4e",
		dash: [5, 5],
		axis: "y1",
		defHidden: true,
	},
	{
		key: "valPveResources",
		label: "Res from Animal Kills",
		color: "#ffd27d",
		dash: [5, 5],
		axis: "y1",
		defHidden: true,
	},
	{
		key: "valRobExcludingPve",
		label: "Res Raided (excl. PvE)",
		color: "#3ba9c4",
		dash: [5, 5],
		axis: "y1",
		defHidden: true,
	},
	{
		key: "rankPve",
		label: "PvE of the week",
		color: "#f0ad4e",
		dash: null,
		axis: "y",
		defHidden: false,
	},
	{
		key: "rankPop",
		label: "Pop Rank",
		color: "#bbb",
		dash: null,
		axis: "y",
		defHidden: false,
	},
	{
		key: "valPop",
		label: "Population",
		color: "#eeeeee",
		dash: [2, 2],
		axis: "y1",
		defHidden: true,
	},
	{
		key: "rankProd",
		label: "Prod/Day Rank",
		color: "#e6b800",
		dash: null,
		axis: "y",
		defHidden: true,
	},
	{
		key: "valProd",
		label: "Production per Hour",
		color: "#00e6e6",
		dash: [2, 2],
		axis: "y1",
		defHidden: false,
	},
	{
		key: "rankProdSoFar",
		label: "Prod So Far Rank",
		color: "#b38600",
		dash: null,
		axis: "y",
		defHidden: true,
	},
	{
		key: "valProdSoFar",
		label: "Total Production",
		color: "#00b3b3",
		dash: [4, 2],
		axis: "y1",
		defHidden: false,
	},
	{
		key: "valBounty",
		label: "Bounty (Raid Gained)",
		color: "#e67e22",
		dash: [4, 2],
		axis: "y1",
		defHidden: false,
	},
	{
		key: "rankCp",
		label: "CP/Day Rank",
		color: "#9333ea",
		dash: null,
		axis: "y",
		defHidden: true,
	},
	{
		key: "cpProd",
		label: "CP per Day",
		color: "#4ade80",
		dash: [2, 2],
		axis: "y1",
		defHidden: true,
	},
	{
		key: "rankCpSoFar",
		label: "CP So Far Rank",
		color: "#6b21a8",
		dash: null,
		axis: "y",
		defHidden: true,
	},
	{
		key: "valCpSoFar",
		label: "Total CP",
		color: "#22c55e",
		dash: [4, 2],
		axis: "y1",
		defHidden: true,
	},
];

/**
 * Load history from storage, process it, and render the Chart.js graph.
 */
let graphLoadVersion = 0;
async function loadGraph(filter, storageKey) {
	if (!storageKey) return;
	const loadVersion = ++graphLoadVersion;

	const res = await api.storage.local.get([
		storageKey,
		"graphPrefs",
		"graphZoom",
	]);
	if (loadVersion !== graphLoadVersion) return;
	let hist = res[storageKey] || [];
	const prefs = res.graphPrefs || {};
	const savedZoom = res.graphZoom || {};
	const isHidden = (label, defaultHidden) =>
		prefs[label] !== undefined ? prefs[label] : defaultHidden;

	// Reset compare box
	const box = document.getElementById("compare-box");
	if (box) box.style.display = "none";

	const resetZoomBtn = document.getElementById("btn-zoom-reset");
	if (resetZoomBtn) {
		resetZoomBtn.classList.toggle(
			"hidden",
			savedZoom.min === undefined && savedZoom.max === undefined,
		);
	}

	if (!hist.length) {
		window.myChart?.destroy();
		window.myChart = null;
		document.getElementById("chart-legend").replaceChildren();
		return;
	}

	// Sanitise stale data + compute derived resource fields
	hist = hist.map((item) => {
		if (item.valRob > 100_000_000_000) item.valRob = null;
		if (item.valRob == null && item.valRes != null) item.valRob = item.valRes;
		if (item.valPve != null) item.valPveResources = item.valPve * 160;
		if (item.valRob != null && item.valPveResources != null) {
			item.valRobExcludingPve = item.valRob - item.valPveResources;
		}
		return item;
	});

	// Unwrap counters before aggregation/interpolation so reset drops never
	// become negative rates or comparison deltas. Keep absolute charts raw.
	hist.sort((a, b) => a.timestamp - b.timestamp);
	for (const key of ["valRob", "valPve", "valBounty"]) {
		const totals = counterTotals(hist, (point) => point[key]);
		hist.forEach((point, i) => { point[`${key}Total`] = totals[i]; });
	}
	for (const point of hist) {
		point.valPveResourcesTotal = point.valPveTotal == null ? null : point.valPveTotal * 160;
		point.valRobExcludingPveTotal = point.valRobTotal == null || point.valPveResourcesTotal == null
			? null : point.valRobTotal - point.valPveResourcesTotal;
	}

	// ── Aggregate / interpolate ──
	let data;
	if (filter === "daily") {
		data = aggregateDaily(hist);
	} else {
		data = interpolateGaps(hist);
	}
	if (!(savedZoom.min >= 0 && savedZoom.max > savedZoom.min && savedZoom.max < data.length)) {
		delete savedZoom.min;
		delete savedZoom.max;
		resetZoomBtn?.classList.add("hidden");
	}

	// ── Velocity transform ──
	if (isVelocityMode) {
		const previous = new Map();
		data = data.map((point) => {
			const delta = { timestamp: point.timestamp };
			for (const { key } of DATASETS_CONFIG) {
				const valueKey = RESET_VALUE_KEYS.includes(key) ? `${key}Total` : key;
				const value = point[valueKey];
				const prev = previous.get(key);
				const hours = prev ? (point.timestamp - prev.timestamp) / 3_600_000 : 0;
				delta[key] = Number.isFinite(value) && prev && hours > 0
					? Math.round(((value - prev.value) / hours) * 10) / 10 : null;
				if (Number.isFinite(value)) previous.set(key, { value, timestamp: point.timestamp });
			}
			return delta;
		});
	}

	// ── Refresh canvas (prevents stale wheel listeners) ──
	let canvas = document.getElementById("rankChart");
	const newCanvas = canvas.cloneNode(true);
	canvas.parentNode.replaceChild(newCanvas, canvas);
	canvas = newCanvas;
	const ctx = canvas.getContext("2d");

	if (window.myChart) window.myChart.destroy();
	Chart.defaults.color = "#888";
	Chart.defaults.borderColor = "#444";

	// ── Drag-compare plugin ──
	let dragStartIdx = null;
	let dragEndIdx = null;
	let isChartDragging = false;
	const timestamps = data.map((x) => x.timestamp);

	const dragComparePlugin = {
		id: "dragCompare",
		beforeEvent(chart, args) {
			const { type, x, y } = args.event;
			if (!["mousedown", "mousemove", "mouseup", "mouseout"].includes(type))
				return;

			const { top, bottom, left, right } = chart.chartArea;
			if (type === "mousedown" && (y < top || y > bottom)) return;

			const boundedX = Math.max(left, Math.min(right, x));
			const xAxis = chart.scales.x;
			let idx = Math.round(xAxis.getValueForPixel(boundedX));
			idx = Math.max(0, Math.min(idx, chart.data.labels.length - 1));

			if (type === "mousedown") {
				isChartDragging = true;
				dragStartIdx = dragEndIdx = idx;
				updateCompareBox(chart, dragStartIdx, dragEndIdx, timestamps);
				args.changed = true;
			} else if (
				type === "mousemove" &&
				isChartDragging &&
				dragEndIdx !== idx
			) {
				dragEndIdx = idx;
				updateCompareBox(chart, dragStartIdx, dragEndIdx, timestamps);
				args.changed = true;
			} else if (
				(type === "mouseup" || type === "mouseout") &&
				isChartDragging
			) {
				isChartDragging = false;
				if (dragStartIdx === dragEndIdx) {
					dragStartIdx = dragEndIdx = null;
					updateCompareBox(chart, null, null, timestamps);
				}
				args.changed = true;
			}
		},
		beforeDraw(chart) {
			if (
				dragStartIdx == null ||
				dragEndIdx == null ||
				dragStartIdx === dragEndIdx
			)
				return;
			const ctx2 = chart.ctx;
			const xAxis = chart.scales.x;
			const startX = xAxis.getPixelForValue(dragStartIdx);
			const endX = xAxis.getPixelForValue(dragEndIdx);
			const l = Math.min(startX, endX);
			const r = Math.max(startX, endX);

			ctx2.save();
			ctx2.fillStyle = "rgba(91, 192, 222, 0.15)";
			ctx2.fillRect(
				l,
				chart.chartArea.top,
				r - l,
				chart.chartArea.bottom - chart.chartArea.top,
			);
			ctx2.beginPath();
			ctx2.strokeStyle = "rgba(91, 192, 222, 0.8)";
			ctx2.lineWidth = 1;
			ctx2.moveTo(l, chart.chartArea.top);
			ctx2.lineTo(l, chart.chartArea.bottom);
			ctx2.moveTo(r, chart.chartArea.top);
			ctx2.lineTo(r, chart.chartArea.bottom);
			ctx2.stroke();
			ctx2.restore();
		},
	};

	// ── Build datasets from config ──
	const valOrNull = (v) => v ?? null;
	const ceilOrNull = (v) => (v != null ? Math.ceil(v) : null);

	const datasets = DATASETS_CONFIG.map((cfg) => ({
		label: cfg.label,
		data: data.map((x) =>
			cfg.ceil ? ceilOrNull(x[cfg.key]) : valOrNull(x[cfg.key]),
		),
		comparisonData: !isVelocityMode && RESET_VALUE_KEYS.includes(cfg.key)
			? data.map((point) => point[`${cfg.key}Total`] ?? null) : null,
		borderColor: cfg.color,
		borderDash: cfg.dash || [],
		yAxisID: cfg.axis,
		hidden: isHidden(cfg.label, cfg.defHidden),
		spanGaps: true,
	}));

	// ── Labels ──
	const labels = data.map((x) => {
		const d = new Date(x.timestamp);
		const dd = String(d.getDate()).padStart(2, "0");
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		if (filter === "daily") return `${dd}/${mm}`;
		const hh = String(d.getHours()).padStart(2, "0");
		const mn = String(d.getMinutes()).padStart(2, "0");
		return `${dd}/${mm} ${hh}:${mn}`;
	});

	// ── Create chart ──
	window.myChart = new Chart(ctx, {
		type: "line",
		data: { labels, datasets },
		options: {
			events: [
				"mousemove",
				"mouseout",
				"click",
				"touchstart",
				"touchmove",
				"mousedown",
				"mouseup",
			],
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "index", intersect: false },
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label(context) {
							let lbl = context.dataset.label || "";
							if (lbl) lbl += ": ";
							if (context.parsed.y !== null)
								lbl += context.parsed.y.toLocaleString();

							if (!isVelocityMode && context.dataIndex > 0) {
								const values = context.dataset.comparisonData || context.dataset.data;
								const curr = values[context.dataIndex];
								let prev = null;
								for (let i = context.dataIndex - 1; i >= 0; i--) {
									if (values[i] != null) {
										prev = values[i];
										break;
									}
								}
								if (prev != null && curr != null) {
									const d = curr - prev;
									if (d !== 0)
										lbl += ` (${d > 0 ? "+" : ""}${d.toLocaleString()})`;
								}
							}
							return lbl;
						},
					},
				},
			},
			scales: {
				y: {
					reverse: !isVelocityMode,
					grid: { color: "#333" },
					title: {
						display: true,
						text: isVelocityMode ? "Avg Rank Change / Hr" : "Rank #",
					},
					position: "left",
				},
				y1: {
					reverse: false,
					position: "right",
					grid: { drawOnChartArea: false },
					title: {
						display: true,
						text: isVelocityMode ? "Avg Value Growth / Hr" : "Value",
					},
					ticks: {
						callback(v) {
							const val = Math.abs(Number(v));
							const sign = Number(v) < 0 ? "-" : "";
							if (val >= 1e9)
								return sign + parseFloat((val / 1e9).toFixed(2)) + "B";
							if (val >= 1e6)
								return sign + parseFloat((val / 1e6).toFixed(2)) + "M";
							if (val >= 1e3)
								return sign + parseFloat((val / 1e3).toFixed(0)) + "k";
							return sign + val;
						},
					},
				},
				x: {
					min: savedZoom.min,
					max: savedZoom.max,
					ticks: {
						maxTicksLimit: 8,
						maxRotation: 0,
						minRotation: 0,
						autoSkipPadding: 20,
						color: "#999",
					},
					grid: { color: "#333" },
				},
			},
			elements: { point: { radius: 0, hoverRadius: 6 } },
		},
		plugins: [dragComparePlugin],
	});

	// ── Scroll zoom & pan ──
	initChartZoom(canvas, timestamps);

	// ── Legend & groups ──
	initCustomLegend(window.myChart);
	initGroupManager(window.myChart);
}

/* ═══════════════════════════════════════════════════════════════════════════
   §10  GRAPH — DATA TRANSFORMS
   ═══════════════════════════════════════════════════════════════════════ */

const RESET_VALUE_KEYS = ["valRob", "valPve", "valPveResources", "valRobExcludingPve", "valBounty"];

/** Value keys where the daily peak is the maximum. */
const VALUE_KEYS = [
	"pointsOff",
	"pointsDef",
	"valRob",
	"valPve",
	"valPveResources",
	"valRobExcludingPve",
	"valPop",
	"valProd",
	"cpProd",
	"valProdSoFar",
	"valCpSoFar",
	"valBounty",
];
/** Rank keys where the daily peak is the minimum (rank 1 > rank 10). */
const RANK_KEYS = [
	"rankPvp",
	"rankDefTop",
	"rankRob",
	"rankPve",
	"rankPop",
	"rankProd",
	"rankCp",
	"rankProdSoFar",
	"rankCpSoFar",
];

/**
 * Collapse raw history into one data-point per day, keeping the best
 * rank (min) and the highest value (max) for each field.
 */
function aggregateDaily(rawData) {
	const groups = {};

	for (const pt of rawData) {
		const d = new Date(pt.timestamp);
		const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

		if (!groups[dateKey]) {
			groups[dateKey] = JSON.parse(JSON.stringify(pt));
			const noon = new Date(pt.timestamp);
			noon.setHours(12, 0, 0, 0);
			groups[dateKey].timestamp = noon.getTime();
			continue;
		}

		const g = groups[dateKey];
		for (const k of VALUE_KEYS) {
			if (pt[k] != null) g[k] = g[k] != null ? Math.max(g[k], pt[k]) : pt[k];
		}
		// Carry the final cumulative observation through a daily bucket.
		for (const key of RESET_VALUE_KEYS) {
			const totalKey = `${key}Total`;
			if (pt[totalKey] != null) g[totalKey] = pt[totalKey];
		}
		for (const k of RANK_KEYS) {
			if (pt[k] != null) g[k] = g[k] != null ? Math.min(g[k], pt[k]) : pt[k];
		}
	}

	return Object.values(groups).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fill large time-gaps between consecutive data points with linearly
 * interpolated "ghost" entries so the graph line stays smooth.
 */
function interpolateGaps(rawData) {
	if (rawData.length === 0) return [];
	const STEP_MS = 30 * 60 * 1000; // 30 min
	const result = [rawData[0]];

	for (let i = 1; i < rawData.length; i++) {
		const prev = rawData[i - 1];
		const curr = rawData[i];
		const gap = curr.timestamp - prev.timestamp;

		if (gap > STEP_MS * 1.5 && gap <= 7 * 24 * 60 * 60 * 1000) {
			const steps = Math.floor(gap / STEP_MS);
			for (let s = 1; s < steps && result.length < MAX_HISTORY_LEN; s++) {
				const fakeTs = prev.timestamp + s * STEP_MS;
				const ratio = (fakeTs - prev.timestamp) / gap;
				const fakePoint = { timestamp: fakeTs };

				for (const key of Object.keys(curr)) {
					if (key === "timestamp" || typeof curr[key] !== "number") continue;
					fakePoint[key] =
						prev[key] != null && curr[key] != null
							? Math.round(prev[key] + (curr[key] - prev[key]) * ratio)
							: null;
				}
				result.push(fakePoint);
			}
		}
		result.push(curr);
	}
	return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §11  GRAPH — ZOOM / PAN
   ═══════════════════════════════════════════════════════════════════════ */

function initChartZoom(canvas, timestamps) {
	let updating = false;

	canvas.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			const chart = window.myChart;
			if (!chart || updating) return;

			updating = true;
			requestAnimationFrame(() => {
				const total = chart.data.labels.length;
				let min = chart.options.scales.x.min ?? 0;
				let max = chart.options.scales.x.max ?? total - 1;
				const range = max - min;

				if (e.shiftKey) {
					// Pan
					let pan =
						Math.ceil(range * 0.05) * Math.sign(e.deltaY) ||
						Math.sign(e.deltaY);
					if (min + pan < 0) pan = -min;
					if (max + pan >= total) pan = total - 1 - max;
					min += pan;
					max += pan;
				} else {
					// Zoom (mouse-centred)
					const appZoom = parseFloat(document.body.style.zoom) || 1.0;
					const rect = canvas.getBoundingClientRect();
					const offsetX = (e.clientX - rect.left) / appZoom;
					const { left, right } = chart.chartArea;
					const ratio =
						Math.max(
							0,
							Math.min(
								1,
								(Math.max(left, Math.min(right, offsetX)) - left) /
									(right - left),
							),
						) || 0.5;
					let amount = Math.max(2, Math.ceil(range * 0.15));

					if (e.deltaY < 0) {
						if (max - min <= 4) {
							updating = false;
							return;
						}
						min += amount * ratio;
						max -= amount * (1 - ratio);
					} else {
						min -= amount * ratio;
						max += amount * (1 - ratio);
					}
					min = Math.max(0, min);
					max = Math.min(total - 1, max);
				}

				chart.options.scales.x.min = min;
				chart.options.scales.x.max = max;
				api.storage.local.set({ graphZoom: { min, max } });
				chart.update("none");

				const resetBtn = document.getElementById("btn-zoom-reset");
				if (resetBtn) {
					resetBtn.classList.toggle("hidden", min <= 0 && max >= total - 1);
				}
				updating = false;
			});
		},
		{ passive: false },
	);
}

/* ═══════════════════════════════════════════════════════════════════════════
   §12  GRAPH — LEGEND
   ═══════════════════════════════════════════════════════════════════════ */

function initCustomLegend(chart) {
	const container = document.getElementById("chart-legend");
	if (!container) return;
	container.innerHTML = "";

	chart.data.datasets.forEach((ds, index) => {
		const isVisible = chart.isDatasetVisible(index);
		const div = document.createElement("div");
		div.className = `legend-item ${isVisible ? "" : "inactive"}`;

		const dot = document.createElement("span");
		dot.className = "legend-color";
		if (ds.borderDash?.length) {
			dot.style.border = `1px dashed ${isVisible ? ds.borderColor : "#666"}`;
			dot.style.backgroundColor = "transparent";
		} else {
			dot.style.backgroundColor = isVisible ? ds.borderColor : "#444";
		}

		const text = document.createElement("span");
		text.innerText = ds.label;

		div.appendChild(dot);
		div.appendChild(text);

		div.onclick = async () => {
			const nowVisible = chart.isDatasetVisible(index);
			chart.setDatasetVisibility(index, !nowVisible);
			chart.update("none");

			// Toggle visuals
			div.classList.toggle("inactive");
			if (ds.borderDash?.length) {
				dot.style.border = `1px dashed ${!nowVisible ? ds.borderColor : "#666"}`;
				dot.style.backgroundColor = "transparent";
			} else {
				dot.style.backgroundColor = !nowVisible ? ds.borderColor : "#444";
			}

			// Persist visibility
			const r = await api.storage.local.get(["graphPrefs"]);
			const newPrefs = r.graphPrefs || {};
			chart.data.datasets.forEach((d, i) => {
				newPrefs[d.label] = !chart.isDatasetVisible(i);
			});
			await api.storage.local.set({ graphPrefs: newPrefs });

			document.getElementById("compare-box").style.opacity = "0";
		};

		container.appendChild(div);
	});
}

/* ═══════════════════════════════════════════════════════════════════════════
   §13  GRAPH — CUSTOM GROUPS
   ═══════════════════════════════════════════════════════════════════════ */

async function initGroupManager(chart) {
	const container = document.getElementById("custom-groups-list");
	if (!container) return;

	// "None" button: hide all datasets
	document.getElementById("btn-group-none").onclick = async () => {
			if (chart !== window.myChart) return;
			const newPrefs = {};
			chart.data.datasets.forEach((ds, i) => {
				chart.setDatasetVisibility(i, false);
				newPrefs[ds.label] = true;
			});
			chart.update("none");
			await api.storage.local.set({ graphPrefs: newPrefs });
			if (chart === window.myChart) initCustomLegend(chart);
	};

	// Load saved groups
	const res = await api.storage.local.get(["customGroups"]);
	if (chart !== window.myChart) return;
	let groups = res.customGroups || {};

	const renderGroups = () => {
		container.innerHTML = "";
		for (const [groupName, groupLabels] of Object.entries(groups)) {
			const btn = document.createElement("button");
			btn.className = "c-btn";
			Object.assign(btn.style, {
				padding: "2px 6px",
				fontSize: "10px",
				display: "flex",
				alignItems: "center",
				gap: "6px",
				borderColor: "#444",
			});

			const textSpan = document.createElement("span");
			textSpan.innerText = groupName;
			textSpan.onclick = async (e) => {
				e.stopPropagation();

				// If ANY in group are hidden → show all; else → hide all
				const anyHidden = chart.data.datasets.some(
					(ds, i) =>
						groupLabels.includes(ds.label) && !chart.isDatasetVisible(i),
				);

				const prR = await api.storage.local.get(["graphPrefs"]);
				if (chart !== window.myChart) return;
				const newPrefs = prR.graphPrefs || {};
				chart.data.datasets.forEach((ds, i) => {
					if (!groupLabels.includes(ds.label)) return;
					chart.setDatasetVisibility(i, anyHidden);
					newPrefs[ds.label] = !anyHidden;
				});
				chart.update("none");
				await api.storage.local.set({ graphPrefs: newPrefs });
				initCustomLegend(chart);
			};

			const delSpan = document.createElement("span");
			delSpan.innerHTML = "&times;";
			Object.assign(delSpan.style, {
				color: "#d9534f",
				cursor: "pointer",
				fontWeight: "bold",
				fontSize: "12px",
			});
			delSpan.onclick = async (e) => {
				e.stopPropagation();
				delete groups[groupName];
				await api.storage.local.set({ customGroups: groups });
				renderGroups();
			};

			btn.appendChild(textSpan);
			btn.appendChild(delSpan);
			container.appendChild(btn);
		}
	};

	renderGroups();

	// ── Modal: create new group ──
	const modal = document.getElementById("group-modal");
	const nameInput = document.getElementById("group-name-input");
	const itemsList = document.getElementById("group-items-list");

	document.getElementById("btn-add-group").onclick = () => {
		nameInput.value = "";
		itemsList.innerHTML = "";

		for (const ds of chart.data.datasets) {
			const lbl = document.createElement("label");
			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.value = ds.label;
			lbl.appendChild(cb);
			lbl.appendChild(document.createTextNode(ds.label));
			itemsList.appendChild(lbl);
		}

		modal.classList.remove("hidden");
		nameInput.focus();
	};

	document.getElementById("btn-cancel-group").onclick = () => {
		modal.classList.add("hidden");
	};

	document.getElementById("btn-save-group").onclick = async () => {
			const gName = nameInput.value.trim();
			if (!gName) return;
			const selected = Array.from(
				itemsList.querySelectorAll("input:checked"),
			).map((cb) => cb.value);
			if (selected.length === 0) return;

			groups[gName] = selected;
			await api.storage.local.set({ customGroups: groups });
			modal.classList.add("hidden");
			renderGroups();
	};
}
