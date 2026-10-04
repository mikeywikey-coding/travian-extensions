// inactivesearch_content.js

// Chrome/Firefox cross-browser shim
const browser = globalThis.browser ?? chrome; // eslint-disable-line no-undef

const jitter = (ms) => Math.round(ms * (0.7 + Math.random() * 0.8));
const MAX_PAGES = 100;

let statusDiv = null;
let runId = 0;

function setStatus(text, color = "#2e86de") {
	if (!statusDiv) return;
	statusDiv.textContent = text;
	statusDiv.style.color = color;
}

// --- UI GENERATION ---
function addControls() {
	if (document.getElementById("is-automator-panel")) return;

	const div = document.createElement("div");
	div.id = "is-automator-panel";

	Object.assign(div.style, {
		position: "fixed",
		top: "260px",
		right: "20px",
		zIndex: "9999",
		padding: "15px",
		backgroundColor: "#fff",
		color: "#222",
		border: "2px solid #2e86de",
		borderRadius: "8px",
		boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
		fontFamily: "Arial, sans-serif",
		display: "flex",
		flexDirection: "column",
		gap: "10px",
		minWidth: "250px",
	});

	const title = document.createElement("div");
	title.textContent = "InactiveSearch Map Opener";
	title.style.fontWeight = "bold";
	title.style.textAlign = "center";
	div.appendChild(title);

	// --- Settings ---
	const settingsDiv = document.createElement("div");
	settingsDiv.style.display = "flex";
	settingsDiv.style.flexDirection = "column";
	settingsDiv.style.gap = "8px";
	settingsDiv.style.fontSize = "12px";

	// A checkbox persisted under storageKey, checked by default.
	const addSetting = (text, storageKey) => {
		const label = document.createElement("label");
		label.style.display = "flex";
		label.style.alignItems = "center";
		label.style.gap = "5px";
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = true;
		label.appendChild(checkbox);
		label.appendChild(document.createTextNode(text));
		settingsDiv.appendChild(label);

		browser.storage.local.get(storageKey).then((res) => {
			if (res[storageKey] !== undefined) checkbox.checked = res[storageKey];
		});
		checkbox.addEventListener("change", () => {
			browser.storage.local.set({ [storageKey]: checkbox.checked });
		});
		return checkbox;
	};

	const bgCheckbox = addSetting("Open in background", "settingBackground");

	const btnStyle = (bg) => ({
		flex: "1",
		padding: "10px",
		backgroundColor: bg,
		color: "white",
		border: "none",
		borderRadius: "4px",
		fontWeight: "bold",
		cursor: "pointer",
	});

	const btnContainer = document.createElement("div");
	btnContainer.style.display = "flex";
	btnContainer.style.gap = "5px";

	const startBtn = document.createElement("button");
	startBtn.textContent = "Start All Pages";
	Object.assign(startBtn.style, btnStyle("#2e86de"));
	startBtn.onclick = () => {
		browser.storage.local.set({
			settingBackground: bgCheckbox.checked,
		});
		collectAndOpen(bgCheckbox.checked);
	};

	const stopBtn = document.createElement("button");
	stopBtn.textContent = "Stop";
	Object.assign(stopBtn.style, btnStyle("#dc2626"));
	stopBtn.onclick = () => {
		runId++;
		browser.runtime.sendMessage({ type: "STOP_QUEUE" });
		setStatus("Stopped.", "#dc2626");
	};

	btnContainer.appendChild(startBtn);
	btnContainer.appendChild(stopBtn);

	// --- Sort by population (reorders the current results page) ---
	const sortBtn = document.createElement("button");
	let popSortDesc = true;
	const updateSortLabel = () => {
		sortBtn.textContent = popSortDesc ? "Sort by Population ↓" : "Sort by Population ↑";
	};
	Object.assign(sortBtn.style, btnStyle("#555"));
	updateSortLabel();
	sortBtn.onclick = () => {
		if (!sortVillagesByPopulation(popSortDesc)) {
			setStatus("No results table to sort.", "#dc2626");
			return;
		}
		popSortDesc = !popSortDesc;
		updateSortLabel();
	};

	statusDiv = document.createElement("div");
	statusDiv.id = "is-automator-status";
	statusDiv.style.marginTop = "10px";
	statusDiv.style.fontWeight = "bold";
	statusDiv.style.textAlign = "center";
	statusDiv.style.color = "#555";
	statusDiv.textContent = "Ready.";

	div.appendChild(settingsDiv);
	div.appendChild(btnContainer);
	div.appendChild(sortBtn);
	div.appendChild(statusDiv);
	document.body.appendChild(div);
}

// --- LOGIC ---

// The results table shows population history across the last few date columns
// (e.g. "30-09" ... "28-09"). The most recent date holds current population.
// Returns the cell index of that column, or -1 if not found.
function getPopulationColumnIndex(table) {
	const ths = Array.from(table.querySelectorAll("thead th"));
	return ths.findIndex((th) => /^\d{1,2}-\d{1,2}$/.test(th.textContent.trim()));
}

// Reorder the visible result rows by current population. Returns false when
// there is no results table on the page. Note: only the current page is
// reordered — the site paginates server-side.
function sortVillagesByPopulation(descending = true) {
	const table = document.querySelector("table.table-inactives");
	if (!table) return false;
	const tbody = table.querySelector("tbody");
	const colIdx = getPopulationColumnIndex(table);
	if (!tbody || colIdx < 0) return false;

	const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
	if (rows.length === 0) return false;

	// parseInt reads the leading population number and stops at the whitespace
	// before the change badge (e.g. "8" from "8 <span>0</span>").
	const popOf = (row) => parseInt(row.children[colIdx]?.textContent.trim(), 10) || 0;

	rows.sort((a, b) => (descending ? popOf(b) - popOf(a) : popOf(a) - popOf(b)));
	rows.forEach((row) => tbody.appendChild(row));
	return true;
}

// Fetch every results page (the site keeps the active filters server-side, so
// "?page=N" returns the same filtered search), collect coordinates, then hand
// the karte.php URLs to the background to open as tabs. Every village is first
// added to the InactiveSearch farmlist. That happens only
// after every page is read, in case added villages drop out of the results and
// shift the later pages.
async function collectAndOpen(openInBackground) {
	const myRun = ++runId;
	const serverDomain = getServerDomain();
	if (!serverDomain) {
		setStatus("Could not detect server domain in URL.", "#dc2626");
		return;
	}

	const seen = new Set();
	const urls = [];
	const vids = new Set();
	let sid = null;
	let farmlistBtnCount = 0;
	const addFrom = (doc) => {
		let added = 0;
		for (const { x, y } of scrapeCoords(doc)) {
			const key = `${x}|${y}`;
			if (seen.has(key)) continue;
			seen.add(key);
			urls.push(`https://${serverDomain}/karte.php?x=${x}&y=${y}`);
			added++;
		}
		const buttons = farmlistButtons(doc);
		farmlistBtnCount += buttons.length;
		for (const vid of unlistedVids(buttons)) vids.add(vid);
		sid ??= doc.querySelector("table.table-inactives")?.dataset.sid ?? null;
		return added;
	};

	let doc = document;
	let pageNum = 1;
	const visited = new Set([location.href]);

	while (true) {
		const added = addFrom(doc);
		setStatus(`Page ${pageNum}: +${added}. Total: ${urls.length}`);

		const nextHref = findNextHref(doc);
		if (!nextHref || pageNum >= MAX_PAGES) break;
		const nextUrl = new URL(nextHref, location.href).href;
		if (visited.has(nextUrl)) break;
		visited.add(nextUrl);

		await new Promise((r) => setTimeout(r, jitter(400)));
		if (runId !== myRun) return;

		try {
			const res = await fetch(nextUrl, { credentials: "include" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			doc = new DOMParser().parseFromString(await res.text(), "text/html");
		} catch (e) {
			setStatus(`Failed loading page ${pageNum + 1}: ${e.message}. Opening ${urls.length} found so far.`, "#e0a800");
			break;
		}
		if (runId !== myRun) return;
		pageNum++;
	}

	if (urls.length === 0) {
		setStatus("No villages found.", "#dc2626");
		return;
	}

	if (farmlistBtnCount === 0 || !sid) {
		setStatus("No Add to farmlist buttons found. Are you signed in to InactiveSearch?", "#dc2626");
		return;
	}
	// Villages already on the farmlist have their button hidden and are skipped.
	try {
		if (!(await addVillagesToFarmlist([...vids], sid, myRun))) return;
	} catch (e) {
		setStatus(`Add to farmlist failed: ${e.message}`, "#dc2626");
		return;
	}

	setStatus(`Opening ${urls.length} villages from ${pageNum} page(s)...`);
	browser.runtime.sendMessage({ type: "START_QUEUE", urls, openInBackground });
}

// The "Add to farmlist" button (lucide list-plus icon) on each result row, only
// rendered when signed in. Matched by its class or by the icon, so a markup
// change to either still finds it. The site hides it once the village is listed.
function farmlistButtons(doc) {
	return [...doc.querySelectorAll("table.table-inactives tbody tr")].flatMap((tr) => {
		const btn =
			tr.querySelector(".add-to-farmlist") ??
			tr.querySelector("[data-lucide='list-plus'], .lucide-list-plus")?.parentElement;
		return btn ? [btn] : [];
	});
}

const farmlistVid = (btn) =>
	btn.getAttribute("data-vid") || btn.closest("[data-vid]")?.getAttribute("data-vid") || null;

// Village ids behind the list-plus buttons that are still visible.
function unlistedVids(buttons) {
	const out = [];
	for (const btn of buttons) {
		if (btn.classList.contains("hidden") || btn.closest("tr")?.classList.contains("hide-farm")) continue;
		const vid = farmlistVid(btn);
		if (vid) out.push(vid);
	}
	return out;
}

const FARMLIST_START_BATCH = 4;
const FARMLIST_MAX_BATCH = 10;
const FARMLIST_RETRIES = 5;

// "Clicks" the list-plus button for every collected village, including those on
// pages that were only fetched: sends the request the site's own button sends
// (its jQuery handler in /js/app.js) and marks matching rows on this page the
// way the button does. Requests go out in concurrent batches that grow by one
// while the site keeps up; a 503/429 halves the batch, pauses (Retry-After or a
// growing backoff) and requeues those villages. Returns false if the run was
// stopped; throws on the first rejected village so a sign-out or farmlist limit
// is shown.
async function addVillagesToFarmlist(vids, sid, myRun) {
	const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
	const buttons = new Map(farmlistButtons(document).map((b) => [farmlistVid(b), b]));
	const queue = [...vids];
	const retries = new Map();
	let batchSize = FARMLIST_START_BATCH;
	let busyStreak = 0;
	let added = 0;

	while (queue.length) {
		if (runId !== myRun) return false;
		setStatus(`Adding to farmlist: ${added} / ${vids.length}`);

		const batch = queue.splice(0, batchSize);
		const results = await Promise.all(batch.map((vid) => postFarmlistAdd(vid, sid, token)));
		if (runId !== myRun) return false;

		const busy = [];
		let retryAfter = 0;
		let error = null;
		for (let j = 0; j < batch.length; j++) {
			const { status, data, retryAfterSec } = results[j];
			if (status === 503 || status === 429) {
				const n = (retries.get(batch[j]) ?? 0) + 1;
				if (n > FARMLIST_RETRIES) error ??= new Error(`HTTP ${status}`);
				retries.set(batch[j], n);
				busy.push(batch[j]);
				retryAfter = Math.max(retryAfter, retryAfterSec);
			} else if (status === 401) {
				error ??= new Error("sign in to InactiveSearch first.");
			} else if (status >= 400) {
				error ??= new Error(`HTTP ${status}`);
			} else if (data.status === "error") {
				const msg = new DOMParser().parseFromString(data.message || "", "text/html").body.textContent.trim();
				error ??= new Error(msg || "rejected by the site.");
			} else {
				const btn = buttons.get(batch[j]);
				if (btn) {
					btn.classList.add("hidden");
					btn.closest("tr")?.classList.add("hide-farm");
				}
				added++;
			}
		}
		if (error) throw error;

		if (busy.length === 0) {
			busyStreak = 0;
			batchSize = Math.min(FARMLIST_MAX_BATCH, batchSize + 1);
			continue;
		}
		queue.unshift(...busy);
		batchSize = Math.max(1, Math.floor(batchSize / 2));
		const waitMs = retryAfter > 0 ? retryAfter * 1000 : jitter(Math.min(1000 * 2 ** busyStreak++, 30000));
		setStatus(`Site busy, slowing down (${added} / ${vids.length} added)...`, "#e0a800");
		await new Promise((r) => setTimeout(r, waitMs));
	}
	setStatus(`Adding to farmlist: ${added} / ${vids.length}`);
	return true;
}

// One add-village POST, reduced to what addVillagesToFarmlist needs. A network
// error counts as busy so it is retried like a 503.
async function postFarmlistAdd(vid, sid, token) {
	try {
		const res = await fetch(new URL(`/user/farmlists/add-village/${vid}`, location.origin), {
			method: "POST",
			credentials: "include",
			headers: {
				"X-CSRF-TOKEN": token,
				"X-Requested-With": "XMLHttpRequest",
				Accept: "application/json",
			},
			body: new URLSearchParams({ sid }),
		});
		const data = res.ok ? await res.json().catch(() => ({})) : {};
		const retryAfterSec = parseInt(res.headers?.get("Retry-After"), 10) || 0;
		return { status: res.status, data, retryAfterSec };
	} catch {
		return { status: 503, data: {}, retryAfterSec: 0 };
	}
}

// Read "(x|y)" coordinates from the results table rows.
function scrapeCoords(doc) {
	const out = [];
	const re = /\(?\s*(-?\d{1,4})\s*\|\s*(-?\d{1,4})\s*\)?/;
	let cells = doc.querySelectorAll("table.table-inactives tbody td.coords");
	if (cells.length === 0) cells = doc.querySelectorAll("table.table-inactives tbody tr");
	cells.forEach((cell) => {
		const m = cell.textContent.match(re);
		if (m) out.push({ x: parseInt(m[1], 10), y: parseInt(m[2], 10) });
	});
	return out;
}

// The pager is a pair of a.btn-pagination links with lucide chevron icons; the
// next link has an href and no "disabled" attribute when another page exists.
function findNextHref(doc) {
	for (const a of doc.querySelectorAll("a.btn-pagination")) {
		if (a.hasAttribute("disabled") || !a.getAttribute("href")) continue;
		if (a.querySelector('[data-lucide="chevron-right"], .lucide-chevron-right')) {
			return a.getAttribute("href");
		}
	}
	return null;
}

function getServerDomain() {
	const pathPart = window.location.pathname
		.split("/")
		.find((part) => part.includes("travian"));
	if (pathPart) return pathPart;

	const link = document.querySelector('a.tv-link[href*="travian"]');
	if (link) {
		try {
			return new URL(link.href).hostname;
		} catch {
			// malformed href — fall through to return null
		}
	}

	return null;
}

addControls();

browser.runtime.onMessage.addListener((msg) => {
	if (msg.type === "UPDATE_PROGRESS" && statusDiv) {
		if (msg.done) setStatus("Done! All villages opened.", "#71d000");
		else setStatus(`Opening: ${msg.processed} / ${msg.total}`);
	}
});
