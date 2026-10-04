// Travian Night Mode — popup controller.
// Night-mode toggle + a custom dark HSV color picker (the native <input type=color>
// dialog can't be themed) with savable favorite colors. Loads state on open;
// persists & broadcasts to open Travian tabs on change.

const toggle = document.getElementById("toggleNight");
const svArea = document.getElementById("svArea");
const svThumb = document.getElementById("svThumb");
const hueArea = document.getElementById("hueArea");
const hueThumb = document.getElementById("hueThumb");
const preview = document.getElementById("preview");
const hexInput = document.getElementById("hexInput");
const favRow = document.getElementById("favRow");
const resetColor = document.getElementById("resetColor");

// Sentinel stored/broadcast to mean "leave the game's native buttons untouched".
// Any hex value instead opts the round buttons into recoloring.
const DEFAULT_STATE = "default";
// Color shown in the picker while in the default (native) state.
const DEFAULT_SWATCH = "#71d000";

// Favorites: stored as an array of hex strings; seeded once with the signature
// purple so the strip isn't empty on first run.
const FAV_KEY = "favoriteColors";
const MAX_FAVS = 12;
const SEED_FAVS = ["#7e31e4"];

// All Travian TLDs we target. Kept in sync with manifest.content_scripts.matches.
const TRAVIAN_URL_PATTERNS = [
	"*://*.travian.com/*",
	"*://*.travian.de/*",
	"*://*.travian.us/*",
	"*://*.travian.fr/*",
	"*://*.travian.it/*",
	"*://*.travian.cz/*",
	"*://*.travian.pl/*",
	"*://*.travian.ru/*",
	"*://*.travian.tr/*",
	"*://*.travian.ae/*",
	"*://*.travian.net/*",
	"*://*.travian.co.uk/*",
];

// Broadcast a message to every open Travian tab so changes apply without a refresh.
// Tabs without the content script yet pick up the stored preference on load.
function broadcast(message) {
	chrome.tabs.query({ url: TRAVIAN_URL_PATTERNS }).then((tabs) => {
		for (const tab of tabs) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
	});
}

// Live preview while dragging or typing: at most one broadcast per frame.
let previewFrame = 0;
function broadcastPreview() {
	if (previewFrame) return;
	previewFrame = requestAnimationFrame(() => {
		previewFrame = 0;
		broadcast({ buttonColor: currentHex() });
	});
}

// ── Color math ───────────────────────────────────────────────────────────────

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// h: 0–360, s/v: 0–1 → {r,g,b}: 0–255
function hsvToRgb(h, s, v) {
	const c = v * s;
	const hp = (h % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) [r, g, b] = [c, x, 0];
	else if (hp < 2) [r, g, b] = [x, c, 0];
	else if (hp < 3) [r, g, b] = [0, c, x];
	else if (hp < 4) [r, g, b] = [0, x, c];
	else if (hp < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = v - c;
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255),
	};
}

// r/g/b: 0–255 → {h:0–360, s:0–1, v:0–1}
function rgbToHsv(r, g, b) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h = (h * 60 + 360) % 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

function rgbToHex({ r, g, b }) {
	return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// Accepts "#rgb", "#rrggbb" (with or without #); returns {r,g,b} or null.
function hexToRgb(hex) {
	let h = String(hex).trim().replace(/^#/, "");
	if (/^[0-9a-f]{3}$/i.test(h)) {
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	}
	if (!/^[0-9a-f]{6}$/i.test(h)) return null;
	const int = parseInt(h, 16);
	return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// ── Picker state ──────────────────────────────────────────────────────────────

let hsv = { h: 0, s: 0, v: 0 };
let favorites = [];

function currentHex() {
	return rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v));
}

// Paint thumbs, hue base, preview and (unless being typed in) the hex field.
function renderPicker() {
	svArea.style.backgroundColor = rgbToHex(hsvToRgb(hsv.h, 1, 1));
	svThumb.style.left = `${hsv.s * 100}%`;
	svThumb.style.top = `${(1 - hsv.v) * 100}%`;
	hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
	const hex = currentHex();
	preview.style.backgroundColor = hex;
	if (document.activeElement !== hexInput) hexInput.value = hex.toUpperCase();
}

// Set picker from a hex string. Preserves the current hue when the color is
// achromatic (black/grey/white) so the hue strip doesn't jump to red.
function setFromHex(hex) {
	const rgb = hexToRgb(hex);
	if (!rgb) return false;
	const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
	hsv = { h: next.s === 0 ? hsv.h : next.h, s: next.s, v: next.v };
	renderPicker();
	return true;
}

// Persist the current color as the chosen button color and push it to tabs.
function persistCurrent() {
	const hex = currentHex();
	chrome.storage.local.set({ purpleButtonColor: hex });
	broadcast({ buttonColor: hex });
}

// Apply a color (favorite click): update the picker, persist, broadcast.
function applyColor(hex) {
	if (setFromHex(hex)) persistCurrent();
}

// ── Drag handling for the square + hue strip ─────────────────────────────────

function makeDrag(el, onMove) {
	let dragging = false;
	el.addEventListener("pointerdown", (e) => {
		dragging = true;
		el.setPointerCapture(e.pointerId);
		onMove(e);
	});
	el.addEventListener("pointermove", (e) => {
		if (dragging) onMove(e);
	});
	const end = () => {
		if (!dragging) return;
		dragging = false;
		persistCurrent();
	};
	el.addEventListener("pointerup", end);
	el.addEventListener("pointercancel", end);
}

function onSvMove(e) {
	const rect = svArea.getBoundingClientRect();
	hsv.s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
	hsv.v = 1 - clamp((e.clientY - rect.top) / rect.height, 0, 1);
	renderPicker();
	broadcastPreview();
}

function onHueMove(e) {
	const rect = hueArea.getBoundingClientRect();
	hsv.h = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
	renderPicker();
	broadcastPreview();
}

makeDrag(svArea, onSvMove);
makeDrag(hueArea, onHueMove);

// Editable hex field: live-preview while typing valid values, normalize/commit
// on blur or Enter.
hexInput.addEventListener("input", () => {
	if (setFromHex(hexInput.value)) broadcastPreview();
});
hexInput.addEventListener("change", () => {
	setFromHex(hexInput.value); // ignore if invalid; reverts to last good value
	hexInput.value = currentHex().toUpperCase();
	persistCurrent();
});
hexInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") hexInput.blur();
});

// ── Favorites ─────────────────────────────────────────────────────────────────

function renderFavorites() {
	favRow.replaceChildren();
	for (const hex of favorites) {
		const swatch = document.createElement("button");
		swatch.type = "button";
		swatch.className = "fav-swatch";
		swatch.style.backgroundColor = hex;
		swatch.title = hex.toUpperCase();
		swatch.addEventListener("click", () => applyColor(hex));

		const remove = document.createElement("span");
		remove.className = "fav-remove";
		remove.textContent = "×";
		remove.title = "Remove";
		remove.addEventListener("click", (e) => {
			e.stopPropagation();
			removeFavorite(hex);
		});

		swatch.appendChild(remove);
		favRow.appendChild(swatch);
	}

	if (favorites.length < MAX_FAVS) {
		const add = document.createElement("button");
		add.type = "button";
		add.className = "fav-add";
		add.textContent = "+";
		add.title = "Save current color";
		add.addEventListener("click", addCurrentFavorite);
		favRow.appendChild(add);
	}
}

function saveFavorites() {
	chrome.storage.local.set({ [FAV_KEY]: favorites });
}

function addCurrentFavorite() {
	const hex = currentHex().toLowerCase();
	if (favorites.length >= MAX_FAVS) return;
	if (favorites.some((c) => c.toLowerCase() === hex)) return;
	favorites.push(hex);
	saveFavorites();
	renderFavorites();
}

function removeFavorite(hex) {
	favorites = favorites.filter((c) => c.toLowerCase() !== hex.toLowerCase());
	saveFavorites();
	renderFavorites();
}

// ── Wiring ────────────────────────────────────────────────────────────────────

toggle.addEventListener("change", () => {
	const isNight = toggle.checked;
	chrome.storage.local.set({ nightMode: isNight });
	broadcast({ nightMode: isNight });
});

resetColor.addEventListener("click", () => {
	// Show the native-green swatch in the picker, but store/broadcast the sentinel
	// so the content script drops the override entirely (vanilla buttons).
	setFromHex(DEFAULT_SWATCH);
	chrome.storage.local.set({ purpleButtonColor: DEFAULT_STATE });
	broadcast({ buttonColor: DEFAULT_STATE });
});

// ── Initial load ──────────────────────────────────────────────────────────────

chrome.storage.local
	.get({ nightMode: true, purpleButtonColor: DEFAULT_STATE, [FAV_KEY]: null })
	.then((res) => {
		toggle.checked = res.nightMode;
		setFromHex(
			res.purpleButtonColor === DEFAULT_STATE ? DEFAULT_SWATCH : res.purpleButtonColor,
		);
		favorites = res[FAV_KEY] ?? [...SEED_FAVS];
		if (res[FAV_KEY] === null) saveFavorites();
		renderFavorites();
	});
