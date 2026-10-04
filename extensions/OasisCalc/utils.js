/**
 * utils.js — Pure utilities: escapeHTML, detectTribe, debug, log, sleep
 */

// Utility: XSS Prevention
const escapeHTML = (str) => {
  return String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        tag
      ],
  );
};

// Parse a JSON object embedded in a script without executing any page code.
function readEmbeddedObject(text, start) {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch (_) { return null; }
    }
  }
  return null;
}

function detectTribe() {
  // Read the village's own field, irrespective of property order or object size.
  for (const script of document.querySelectorAll("script:not([src])")) {
    const text = script.textContent;
    for (const match of text.matchAll(/"village"\s*:\s*\{/g)) {
      const village = readEmbeddedObject(text, match.index + match[0].lastIndexOf("{"));
      const tribe = Number(village?.tribeId);
      if ([1, 2, 3, 6, 7, 8].includes(tribe)) return tribe;
    }
  }
  return null;
}

/**
 * Fetch /statistics/general and read tribe icon classes to determine server type.
 * The table contains <i class="tribe{N}_medium"> for each active tribe.
 * Tribe numbers 6/7 → 5-tribe; 8 → 6-tribe; only 1/2/3 → 3-tribe.
 * Returns "3-tribe", "5-tribe", "6-tribe", or null on failure.
 */
let _cachedServerType = undefined;
async function detectServerTypeFromStats() {
  if (_cachedServerType !== undefined) return _cachedServerType;
  try {
    await sleep(1200 + Math.random() * 1800);
    const res = await fetch("/statistics/general", {
      credentials: "include",
      referrer: location.origin + "/statistics",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": navigator.language || "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    let maxTribe = 0;

    // Scan all elements with tribe class references (icons, table rows, badges)
    doc.querySelectorAll("[class*='tribe']").forEach((el) => {
      const m = el.className.match(/tribe(\d+)/);
      if (m) maxTribe = Math.max(maxTribe, parseInt(m[1]));
    });

    // Scan inline scripts for tribeId values
    if (maxTribe <= 3) {
      doc.querySelectorAll("script:not([src])").forEach((script) => {
        for (const m of script.textContent.matchAll(
          /["']?tribeId["']?\s*[:=]\s*(\d)/g,
        )) {
          maxTribe = Math.max(maxTribe, parseInt(m[1]));
        }
      });
    }

    let result = null;
    if (maxTribe >= 8) result = "6-tribe";
    else if (maxTribe > 3) result = "5-tribe";
    else if (maxTribe > 0) result = "3-tribe";
    _cachedServerType = result;
    return result;
  } catch (_) {
    return null;
  }
}

/**
 * Detect server type from current page DOM (fast, synchronous fallback).
 * Returns "3-tribe", "5-tribe", "6-tribe", or null.
 */
function detectServerTypeFromDOM() {
  // Player's own tribe from inline scripts
  const playerTribe = detectTribe();
  if (playerTribe && playerTribe > 3) {
    return playerTribe >= 8 ? "6-tribe" : "5-tribe";
  }

  // Inline scripts with tribeId fields
  let maxTribe = 0;
  for (const script of document.querySelectorAll("script:not([src])")) {
    for (const m of script.textContent.matchAll(
      /["']?tribeId["']?\s*[:=]\s*(\d)/g,
    )) {
      maxTribe = Math.max(maxTribe, parseInt(m[1]));
    }
  }
  if (maxTribe >= 8) return "6-tribe";
  if (maxTribe > 3) return "5-tribe";

  // DOM tribe classes (profiles, tooltips)
  if (document.querySelector('[class*="tribe8"]')) return "6-tribe";
  if (document.querySelector('[class*="tribe6"],[class*="tribe7"]'))
    return "5-tribe";

  return null;
}

/**
 * Apply the correct troop data based on detected server type.
 * Uses DOM detection immediately, then refines from statistics page async.
 */
function applyServerTroopData() {
  // Immediate DOM-based detection (synchronous)
  const domType = detectServerTypeFromDOM();
  detectedServerType = domType;
  TROOP_DATA =
    domType === "3-tribe" ? TROOP_DATA_ORIGINAL : TROOP_DATA_REBALANCED;
  updateServerTypeBadge();

  // Async refinement from /statistics/general tribe distribution table
  detectServerTypeFromStats().then((statsType) => {
    if (!statsType || statsType === detectedServerType) return;
    detectedServerType = statsType;
    TROOP_DATA =
      statsType === "3-tribe" ? TROOP_DATA_ORIGINAL : TROOP_DATA_REBALANCED;
    updateServerTypeBadge();
    renderResults();
  });

  return domType;
}

// Parse "_vpcoords" value into numeric {cx, cy} (defaults to 0|0).
function getCoords() {
  const raw = document.getElementById("_vpcoords")?.value || "";
  const [cx, cy] = raw.split("|").map((n) => parseInt(n) || 0);
  return { cx: cx || 0, cy: cy || 0 };
}

// Shortest toroidal delta on the wrapped map
function torusDelta(a, b) {
  let d = Math.abs(a - b);
  if (d > MAP_SIZE / 2) d = MAP_SIZE - d;
  return d;
}

// Find the village matching current _vpcoords, or null.
function getActiveVillage() {
  const { cx, cy } = getCoords();
  return getVillages().find((v) => v.x === cx && v.y === cy) || null;
}

// Per-session sessionStorage key for rally-point troop prefill
function rallyKey() {
  return "_tp" + location.hostname.replace(/\./g, "").slice(0, 4);
}

// CSS class for a hero HP-loss percentage
function hpClass(hp) {
  if (hp > 50) return "_vphp-high";
  if (hp > 25) return "_vphp-mid";
  if (hp > 10) return "_vphp-low";
  return "_vphp-ok";
}

function log(msg) {
  const el = document.getElementById("_vpdebug-log");
  if (el) el.value = `> ${escapeHTML(msg)}\n` + el.value;
}

function sleep(ms) {
  const jittered = Math.round(ms * (0.7 + Math.random() * 0.8));
  return new Promise((r) => setTimeout(r, jittered));
}
