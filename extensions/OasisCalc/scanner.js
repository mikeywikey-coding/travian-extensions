/** Passive map response normalization and conservative garrison parsing. */
function extractTileArray(obj) {
  const tiles = [];
  const visited = new Set();
  function visit(value, depth) {
    if (!value || typeof value !== "object" || depth > 12 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(entry => visit(entry, depth + 1));
      return;
    }
    if (value.position && ("text" in value || "t" in value || "title" in value)) {
      tiles.push(value);
      return;
    }
    if (value.position && value.tile && typeof value.tile === "object") {
      visit({ ...value.tile, position: value.position }, depth + 1);
      return;
    }
    for (const key of ["tiles", "elements", "data", "response"]) visit(value[key], depth + 1);
  }
  visit(obj, 0);
  return tiles;
}

function parseAnimalCount(value) {
  const clean = String(value).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  // Accept integers and locale grouping, never turn '?' or '12?' into a count.
  if (!/^(?:\d+|\d{1,3}(?:[,.'’\s\u00a0\u202f]\d{3})+)$/.test(clean)) return null;
  const count = Number(clean.replace(/\D/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/**
 * Oasis resource bonus from a map tile: "{a:r1} {a.r1} 25%<br />{a:r4} {a.r4} 25%"
 * → "1:25,4:25" (r1 lumber, r2 clay, r3 iron, r4 crop). "" when there is none.
 * Valley tiles use the same tokens for their field split but without a "%".
 */
function parseOasisBonus(tile) {
  const text = typeof tile.text === "string" ? tile.text : typeof tile.t === "string" ? tile.t : "";
  const clean = text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  const parts = [];
  for (const m of clean.matchAll(/\{a:r([1-4])\}[^%<]*?(\d+)\s*%/g)) parts.push(`${m[1]}:${m[2]}`);
  return parts.join(",");
}

function inspectOasisTile(tile) {
  const text = typeof tile.text === "string" ? tile.text : typeof tile.t === "string" ? tile.t : "";
  const title = typeof tile.title === "string" ? tile.title : "";
  // Detached template content does not execute scripts or fetch embedded images.
  const template = document.createElement("template");
  template.innerHTML = text;
  const root = template.content;
  const animalIcons = [...root.querySelectorAll("[class]")].filter(el =>
    [...el.classList].some(cls => /^u\d+$/.test(cls) && ANIMAL_STATS[Number(cls.slice(1))]),
  );
  const isOasis = /\{k\.(?:fo|bt)\}/.test(title + text) ||
    /^(?:unoccupied|occupied) oasis\b/i.test(title.trim()) ||
    !!root.querySelector(".oasis") || animalIcons.length > 0;
  if (!isOasis) return { isOasis: false };
  const occupied = /\{k\.bt\}/.test(title + text) ||
    Number(tile.uid) > 0 || !!root.querySelector('a[href*="/profile/"]') ||
    /\{k\.(?:spieler|allianz)\}/.test(text) ||
    /\b(?:Player|Alliance)\s*:/.test(root.textContent) || /^occupied oasis\b/i.test(title.trim());
  if (occupied) return { isOasis: true, status: "occupied", animals: [] };
  const counts = new Map();
  let complete = animalIcons.length > 0;
  for (const icon of animalIcons) {
    const id = Number([...icon.classList].find(cls => /^u\d+$/.test(cls)).slice(1));
    const row = icon.closest(".tooltipUnit, tr, li") || icon.parentElement;
    const values = row?.querySelectorAll(".val, .value");
    const value = values?.length === 1 ? values[0] : null;
    const count = value ? parseAnimalCount(value.textContent) : null;
    if (count === null || counts.has(id)) { complete = false; continue; }
    counts.set(id, count);
  }
  if (!complete) return { isOasis: true, status: "unknown", animals: [] };
  const animals = [...counts].filter(([, count]) => count > 0).map(([id, count]) => ({ id, count }));
  return { isOasis: true, status: animals.length ? "animals" : "empty", animals };
}

function getObservationAge(oasis, now = Date.now()) {
  const age = now - oasis.scannedAt;
  if (!Number.isFinite(oasis.scannedAt) || oasis.scannedAt <= 0 || age < 0) {
    return { label: "Age unknown", stale: true };
  }
  const minutes = Math.floor(age / 60000);
  const label = minutes < 1 ? "" : minutes < 60 ? `${minutes}m old` :
    minutes < 1440 ? `${Math.floor(minutes / 60)}h old` : `${Math.floor(minutes / 1440)}d old`;
  return { label, stale: age >= 10 * 60 * 1000 || !!oasis.observationIncomplete };
}

function refreshObservationAges(now = Date.now()) {
  document.querySelectorAll("._vpage").forEach(el => {
    const age = getObservationAge({
      scannedAt: Number(el.dataset.scannedAt),
      observationIncomplete: el.dataset.incomplete === "1",
    }, now);
    el.textContent = age.label;
    el.classList.toggle("_vphp-mid", age.stale);
    el.classList.toggle("_vphp-ok", !age.stale);
  });
}
