/**
 * bridge.js — Isolated world side of the two-world bridge.
 *
 * Listens for tile data forwarded from the Travian.api wrapper running
 * in MAIN world (page-bridge.js) and feeds it into analyzeTiles().
 */

// Both execution worlds must use the same channel even if cookies/time change.
const _EVT_TD = "oasiscalc:map-data:v1";
let _tilePipelineReady = false;
let _pendingTileBatches = [];

function receiveTileData(data) {
  if (!_tilePipelineReady) {
    _pendingTileBatches.push(data);
    return;
  }
  const tiles = extractTileArray(data);
  if (!tiles.length) return;
  analyzeTiles(tiles);
  updateCoverageDisplay();
}

function flushPendingTiles() {
  _tilePipelineReady = true;
  const pending = _pendingTileBatches;
  _pendingTileBatches = [];
  pending.forEach(receiveTileData);
}

// Receive tile data forwarded from Travian.api wrapper in page-bridge.js
document.addEventListener(_EVT_TD, (e) => {
  if (!e.detail) return;
  try {
    receiveTileData(JSON.parse(e.detail));
  } catch (_) {}
});
