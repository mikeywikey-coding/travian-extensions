/**
 * coverage.js — Exact coordinate coverage tracking.
 * Raster image blocks do not imply that their animal data was observed.
 */

// Map<"x|y", timestamp> — observed tile → last-seen Unix ms
let _covGrid = new Map();

// Keep coordinates independent of zoom and viewport dimensions.
function _blockKey(tileX, tileY) {
  return `${tileX}|${tileY}`;
}

// Debounced persistence — saves coverage 2s after last tile batch
let _covSaveTimer = 0;
function _debounceSaveCoverage() {
  clearTimeout(_covSaveTimer);
  _covSaveTimer = setTimeout(_saveCoverage, 2000);
}

// Called only for tiles that include observation data.
function _markCovered(tileX, tileY) {
  _covGrid.set(_blockKey(tileX, tileY), Date.now());
  _debounceSaveCoverage();
}

function _saveCoverage() {
  const obj = {};
  obj[COVERAGE_KEY] = Array.from(_covGrid.entries());
  browser.storage.local.set(obj);
}

function _loadCoverage() {
  browser.storage.local.get(COVERAGE_KEY).then((data) => {
    if (data && data[COVERAGE_KEY]) {
      for (const entry of Array.isArray(data[COVERAGE_KEY]) ? data[COVERAGE_KEY] : []) {
        if (!Array.isArray(entry)) continue;
        const [key, timestamp] = entry;
        if (typeof key !== "string" || !/^-?\d+\|-?\d+$/.test(key) || !Number.isFinite(timestamp)) continue;
        _covGrid.set(key, Math.max(_covGrid.get(key) || 0, timestamp));
      }
    }
  });
}
