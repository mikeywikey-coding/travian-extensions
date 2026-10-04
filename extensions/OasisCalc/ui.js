/**
 * ui.js — Panel creation, village dropdown, unit grid, and event handlers
 */

function getVillages() {
  const villages = [];
  try {
    const listItems = document.querySelectorAll(
      "#sidebarBoxVillagelist .listEntry, #sidebarBoxVillageList .listEntry, .villageList .listEntry",
    );
    listItems.forEach((item) => {
      const nameEl = item.querySelector(".name") || item;
      let nameText = nameEl.innerText.trim();
      let coordText = item.innerText;

      const coordsGrid = item.querySelector(".coordinatesGrid");
      if (coordsGrid) {
        const x = coordsGrid.querySelector(".coordinateX")?.innerText;
        const y = coordsGrid.querySelector(".coordinateY")?.innerText;
        if (x && y) coordText = `(${x}|${y})`;
      }

      // Extract village DID from link href (e.g. ?newdid=12345 or /village/12345)
      let did = null;
      const link = item.querySelector("a[href]");
      if (link) {
        const hrefMatch = link.href.match(/newdid=(\d+)|\/village\/(\d+)/);
        if (hrefMatch) did = hrefMatch[1] || hrefMatch[2];
      }
      if (!did) {
        const didAttr =
          item.dataset?.did || item.closest("[data-did]")?.dataset?.did;
        if (didAttr) did = didAttr;
      }

      const isActive =
        item.classList.contains("active") ||
        item.querySelector(".active") !== null ||
        item.closest(".active") !== null;

      // Strip Unicode bidi control chars (LTR/RTL marks on Arabic servers)
      coordText = coordText.replace(
        /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
        "",
      );

      const match = coordText.match(
        /\(?\s*([−-]?\d+)\s*[|/]\s*([−-]?\d+)\s*\)?/,
      );
      if (match) {
        let x = parseInt(match[1].replace("−", "-"));
        let y = parseInt(match[2].replace("−", "-"));
        if (!isNaN(x) && !isNaN(y)) {
          villages.push({
            name: nameText,
            x: x,
            y: y,
            did: did,
            active: isActive,
          });
        }
      }
    });
  } catch (_) {}
  return villages;
}

function updateCoverageDisplay() {
  const fill = document.getElementById("_vpcov-fill");
  const label = document.getElementById("_vpcov-label");
  const meter = document.getElementById("_vpcov-meter");
  if (!fill || !label) return;
  const rawCoords = document.getElementById("_vpcoords")?.value || "";
  if (!rawCoords.includes("|")) {
    fill.style.width = "0%";
    label.textContent = "Set coords first";
    return;
  }
  const { cx, cy } = getCoords();
  const radius = parseInt(document.getElementById("_vpradius")?.value) || 20;
  const mode = document.getElementById("_vpmode")?.value || "GRID";

  if (mode === "DB") {
    const scanned = countSessionOasesInRadius(cx, cy, radius);
    const known = countKnownOasesInRadius(cx, cy, radius);
    const updPct = known === 0 ? 0 : Math.round((scanned / known) * 100);
    fill.style.width = updPct + "%";
    if (known === 0) {
      label.textContent = "No known oases";
      if (meter) meter.title = "Run discovery mode first";
    } else {
      label.textContent = `${scanned}/${known} (${updPct}%) oases`;
      if (meter)
        meter.title =
          updPct >= 100
            ? "All known oases updated"
            : "Pan the map to update more oases";
    }
  } else {
    const tilesScanned = countScannedTilesInRadius(cx, cy, radius);
    const tilesTotal = countTotalTilesInRadius(radius);
    const tilePct =
      tilesTotal === 0 ? 0 : Math.round((tilesScanned / tilesTotal) * 100);
    fill.style.width = tilePct + "%";
    if (tilesScanned === 0) {
      label.textContent = "Pan map to scan";
      if (meter) meter.title = "Pan the map to scan oases";
    } else {
      label.textContent = `${tilesScanned}/${tilesTotal} (${tilePct}%) tiles`;
      if (meter)
        meter.title =
          tilePct >= 100
            ? "Fully scanned within radius"
            : "Pan the map to discover more oases";
    }
  }
}

function updateVillageDropdown() {
  const vSelect = document.getElementById("_vpvillage-select");
  if (!vSelect) return;

  const villages = getVillages();
  const activeVillage = villages.find((v) => v.active);
  let html = '<option value="">-- Select Village --</option>';

  if (villages.length === 0) {
    html += '<option value="" disabled>⚠️ No villages found</option>';
  } else {
    villages.forEach((v) => {
      html += `<option value="${escapeHTML(v.x)}|${escapeHTML(v.y)}" data-did="${escapeHTML(v.did || "")}">🏠 ${escapeHTML(v.name)} (${escapeHTML(v.x)}|${escapeHTML(v.y)})</option>`;
    });
  }
  vSelect.innerHTML = html;

  // Auto-select the currently active village
  if (activeVillage) {
    const val = `${activeVillage.x}|${activeVillage.y}`;
    vSelect.value = val;
    const coordsInput = document.getElementById("_vpcoords");
    if (coordsInput) coordsInput.value = val;
  }
}

function prefillTroopsFromStorage(villageName) {
  if (!villageName) return;

  const tribeId = detectTribe();
  if (!tribeId || !TROOP_DATA[tribeId]) return;

  browser.storage.local.get([TROOPS_KEY, SMITHY_KEY]).then((data) => {
    const villTroops = (data[TROOPS_KEY] || {})[villageName];
    if (villTroops) {
      TROOP_DATA[tribeId].units.forEach((unit) => {
        const uX = parseInt(unit.id.substring(1));
        const storageKey = `${Math.ceil(uX / 10)}-${((uX - 1) % 10) + 1}`;
        const count = villTroops[storageKey] || 0;
        const input = document.getElementById(`_vptroop-${unit.id}`);
        if (!input) return;
        input.value = count;
        input
          .closest("._vpunit-cell")
          ?.classList.toggle("has-units", count > 0);
      });
    }

    const villSmithy = (data[SMITHY_KEY] || {})[villageName];
    TROOP_DATA[tribeId].units.forEach((unit) => {
      const smithyEl = document.getElementById(`_vpsmithy-${unit.id}`);
      if (smithyEl) smithyEl.value = (villSmithy && villSmithy[unit.id]) || 0;
    });

    saveSettings();
    renderResults();
  });
}

function updateServerTypeBadge() {
  const badge = document.getElementById("_vpserver-badge");
  if (!badge) return;
  if (detectedServerType) {
    badge.textContent = detectedServerType;
    badge.style.display = "";
    badge.title =
      detectedServerType === "3-tribe"
        ? "Original troop stats (3-tribe server)"
        : "Rebalanced troop stats (" + detectedServerType + " server)";
  } else {
    badge.textContent = "rebalanced*";
    badge.style.display = "";
    badge.title =
      "Server type not yet confirmed — defaulting to rebalanced stats";
  }
}

// --- Unit stats tooltip (shown when hovering a unit's icon tile) ---
let unitTooltipEl = null;

function showUnitTooltip(tile, unit) {
  if (!unitTooltipEl) {
    unitTooltipEl = document.createElement("div");
    unitTooltipEl.id = "_vpunit-tooltip";
    document.body.appendChild(unitTooltipEl);
  }
  const smithyEl = document.getElementById(`_vpsmithy-${unit.id}`);
  const smithyLvl = smithyEl ? parseInt(smithyEl.value) || 0 : 0;
  let atkHTML = String(unit.atk);
  if (smithyLvl > 0) {
    const effectiveAtk =
      Math.round(unit.atk * (1 + 0.015 * smithyLvl) * 10) / 10;
    atkHTML += ` <span class="_vputt-bonus">→ ${effectiveAtk}</span>`;
  }
  const totalCost = unit.cost.reduce((s, v) => s + v, 0);
  unitTooltipEl.innerHTML = `
        <div class="_vputt-name">${escapeHTML(unit.name)}</div>
        <div class="_vputt-row"><span>Attack</span><span>${atkHTML}</span></div>
        <div class="_vputt-row"><span>Speed</span><span>${unit.spd} fields/h</span></div>
        <div class="_vputt-row"><span>Carry</span><span>${unit.carry}</span></div>
        <div class="_vputt-row"><span>Cost</span><span>${totalCost.toLocaleString()} res</span></div>
        <div class="_vputt-hint">Click to enable/disable</div>
    `;
  // Position beside the tile (fixed, so the grid's overflow doesn't clip it)
  const rect = tile.getBoundingClientRect();
  unitTooltipEl.style.display = "block";
  const tw = unitTooltipEl.offsetWidth;
  const th = unitTooltipEl.offsetHeight;
  let x = rect.right + 8;
  if (x + tw > window.innerWidth - 4) x = rect.left - tw - 8;
  let y = rect.top + rect.height / 2 - th / 2;
  y = Math.max(4, Math.min(y, window.innerHeight - th - 4));
  unitTooltipEl.style.left = x + "px";
  unitTooltipEl.style.top = y + "px";
}

function hideUnitTooltip() {
  if (unitTooltipEl) unitTooltipEl.style.display = "none";
}

function buildUnitGrid() {
  const tribeId = detectTribe();
  const warn = document.getElementById("_vptroop-warn");
  const badge = document.getElementById("_vptribe-badge");
  const grid = document.getElementById("_vpunit-grid");

  const fetchBtn = document.getElementById("_vpfetch-troops");
  const clearBtn = document.getElementById("_vpclear-troops");

  if (!tribeId || !TROOP_DATA[tribeId]) {
    warn.style.display = "";
    badge.style.display = "none";
    if (fetchBtn) fetchBtn.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    grid.innerHTML = "";
    return;
  }

  warn.style.display = "none";
  const tribe = TROOP_DATA[tribeId];
  badge.textContent = tribe.name;
  badge.style.display = "";
  updateServerTypeBadge();
  if (fetchBtn) {
    fetchBtn.style.display = "";
    fetchBtn.onclick = fetchAndStoreTroops;
  }
  if (clearBtn) {
    clearBtn.style.display = "";
    clearBtn.onclick = () => {
      grid.querySelectorAll("._vpunit-input").forEach((input) => {
        input.value = 0;
        input.closest("._vpunit-cell")?.classList.remove("has-units");
      });
      saveSettings();
      renderResults();
    };
  }

  const previewRow = document.getElementById("_vppreview-unit-row");
  const maxTroopsRow = document.getElementById("_vpmax-troops-row");
  const previewSelect = document.getElementById("_vppreview-unit");
  if (previewRow && previewSelect) {
    previewRow.style.display = "";
    if (maxTroopsRow) maxTroopsRow.style.display = "";
    let opts = '<option value="fastest">Fastest unit</option>';
    tribe.units.forEach((u) => {
      opts += `<option value="${escapeHTML(u.id)}">${escapeHTML(u.name)}</option>`;
    });
    previewSelect.innerHTML = opts;
    previewSelect.addEventListener("change", () => {
      saveSettings();
      renderResults();
    });
  }

  grid.innerHTML = tribe.units
    .map(
      (u) => `
        <div class="_vpunit-cell${disabledUnits.has(u.id) ? " unit-disabled" : ""}" data-unit-id="${escapeHTML(u.id)}">
            <div class="_vpunit-icontile">
                <img class="unit ${escapeHTML(u.id)} _vpunit-icon" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
            </div>
            <span class="_vpunit-name">${escapeHTML(u.name)}</span>
            <div class="_vpstepper _vpstepper-box">
                <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vptroop-${escapeHTML(u.id)}" data-dir="-1">−</button>
                <input type="number"
                    id="_vptroop-${escapeHTML(u.id)}"
                    class="_vpunit-input"
                    value="0"
                    min="0"
                    data-unit-id="${escapeHTML(u.id)}"
                >
                <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vptroop-${escapeHTML(u.id)}" data-dir="1">+</button>
            </div>
            <div class="_vpsmithy-row _vpstepper _vpstepper-smithy" title="Smithy level">
                <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vpsmithy-${escapeHTML(u.id)}" data-dir="-1">−</button>
                <input type="number"
                    id="_vpsmithy-${escapeHTML(u.id)}"
                    class="_vpsmithy-input"
                    value="0"
                    min="0"
                    max="20"
                    title="Smithy upgrade level (0-20)"
                >
                <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vpsmithy-${escapeHTML(u.id)}" data-dir="1">+</button>
            </div>
        </div>
    `,
    )
    .join("");

  // Clicking a unit's icon tile toggles it on/off for all calculations
  grid.addEventListener("click", (e) => {
    const tile = e.target.closest("._vpunit-icontile");
    if (!tile) return;
    const cell = tile.closest("._vpunit-cell");
    const unitId = cell?.dataset.unitId;
    if (!unitId) return;
    if (disabledUnits.has(unitId)) disabledUnits.delete(unitId);
    else disabledUnits.add(unitId);
    cell.classList.toggle("unit-disabled", disabledUnits.has(unitId));
    saveSettings();
    renderResults();
  });

  // Hovering a unit's icon tile shows its stats in a floating tooltip
  grid.addEventListener("mouseover", (e) => {
    const tile = e.target.closest("._vpunit-icontile");
    if (!tile) return;
    const unitId = tile.closest("._vpunit-cell")?.dataset.unitId;
    const unit = tribe.units.find((u) => u.id === unitId);
    if (unit) showUnitTooltip(tile, unit);
  });
  grid.addEventListener("mouseout", (e) => {
    const tile = e.target.closest("._vpunit-icontile");
    if (tile && !tile.contains(e.relatedTarget)) hideUnitTooltip();
  });
  grid.addEventListener("scroll", hideUnitTooltip);

  grid.addEventListener("input", (e) => {
    const unitInput = e.target.closest("._vpunit-input");
    const smithyInput = e.target.closest("._vpsmithy-input");
    if (!unitInput && !smithyInput) return;

    if (unitInput) {
      const cell = unitInput.closest("._vpunit-cell");
      const count = parseInt(unitInput.value) || 0;
      cell.classList.toggle("has-units", count > 0);
    }

    saveSettings();
    renderResults();
  });
}

// --- Density toggle (presentation only — drives row layout via a panel class) ---
function getDensity() {
  const panel = document.getElementById("_vppanel");
  if (!panel) return "normal";
  if (panel.classList.contains("dens-compact")) return "compact";
  if (panel.classList.contains("dens-detail")) return "detail";
  return "normal";
}

function setDensity(density, save) {
  const panel = document.getElementById("_vppanel");
  if (!panel) return;
  const d = ["compact", "normal", "detail"].includes(density)
    ? density
    : "normal";
  panel.classList.remove("dens-compact", "dens-normal", "dens-detail");
  panel.classList.add("dens-" + d);
  panel.querySelectorAll("._vpdens-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.density === d);
  });
  if (save) saveSettings();
}

// Tag the panel with the active tab so CSS can size the results list per tab
// (the hero tab has room for a taller list than the troop-setup tab).
function setPanelTab(tab) {
  const panel = document.getElementById("_vppanel");
  if (!panel) return;
  panel.classList.toggle("tab-troops", tab === "troops");
  panel.classList.toggle("tab-hero", tab !== "troops");
}

// Reflect the hidden #_vpmode select's value in the segmented buttons
function updateModeButtons() {
  const mode = document.getElementById("_vpmode");
  if (!mode) return;
  document.querySelectorAll("._vpseg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode.value);
  });
}

// Make the panel draggable by its header. Travian's map swallows document-level
// mouse/pointer events mid-drag, so we use pointer capture + stopPropagation
// (same workaround the risk slider needs) to keep the drag alive over the map.
function makePanelDraggable(panel, handle) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (e) => {
    // Don't start a drag from the density / collapse controls in the header.
    if (e.target.closest("button, input, select, a, label")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.left = startLeft + "px";
    panel.style.top = startTop + "px";
    panel.style.right = "auto";
    panel.classList.add("dragging");
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    // Clamp so the panel can't be dragged fully off-screen.
    const maxLeft = window.innerWidth - 40;
    const maxTop = window.innerHeight - 40;
    const nl = Math.max(0, Math.min(maxLeft, startLeft + (e.clientX - startX)));
    const nt = Math.max(0, Math.min(maxTop, startTop + (e.clientY - startY)));
    panel.style.left = nl + "px";
    panel.style.top = nt + "px";
    e.preventDefault();
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("dragging");
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    saveSettings(); // persist the new position
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  // Keep map handlers from hijacking the drag.
  ["pointerdown", "pointermove", "pointerup", "mousedown", "mousemove"].forEach(
    (evt) => handle.addEventListener(evt, (e) => e.stopPropagation()),
  );
}

// Refresh the hero summary line from the (possibly synced) input values
function updateHeroSummary() {
  const off = parseInt(document.getElementById("_vphero-off")?.value) || 0;
  const hp = document.getElementById("_vpmax-hp")?.value ?? "100";
  const ts = document.getElementById("_vpts-lvl")?.value ?? "0";
  const tier = document.getElementById("_vphero-map")?.value ?? "0";
  const offDisp = document.getElementById("_vphero-off-disp");
  const sub = document.getElementById("_vphero-sub");
  const tierDisp = document.getElementById("_vphero-tier-disp");
  if (offDisp) offDisp.textContent = off.toLocaleString();
  if (sub)
    sub.textContent = `off · ${hp}% HP · TS ${ts}`;
  if (tierDisp) tierDisp.textContent = `Map bonus tier ${tier}`;
}

function createUI() {
  if (document.getElementById("_vppanel")) return;

  const div = document.createElement("div");
  div.id = "_vppanel";
  div.classList.add("dens-normal");
  div.classList.add("tab-hero");
  div.innerHTML = `
        <div class="_vpheader">
            <div class="_vplogo"></div>
            <span class="_vpheader-title">OASIS FINDER</span>
            <div class="_vpheader-tools">
                <div class="_vpdensity">
                    <button type="button" class="_vpdens-btn" data-density="compact" title="Compact">≡</button>
                    <button type="button" class="_vpdens-btn active" data-density="normal" title="Normal">☰</button>
                    <button type="button" class="_vpdens-btn" data-density="detail" title="Detail">▤</button>
                </div>
                <button id="_vpcollapse" class="_vpcollapse-btn" title="Collapse">−</button>
            </div>
        </div>

        <div id="_vpbody">
            <div class="_vpsection">
                <div class="_vpvillage-row">
                    <div class="_vpswatch"></div>
                    <select id="_vpvillage-select" class="_vpselect">
                        <option value="">Loading...</option>
                    </select>
                </div>
                <div class="_vpscan-row">
                    <div class="_vpmode-seg">
                        <button type="button" class="_vpseg-btn active" data-mode="GRID">Discovery</button>
                        <button type="button" class="_vpseg-btn" data-mode="DB">Update</button>
                    </div>
                    <div class="_vpradius-group">
                        <span class="_vpstepper-label">RADIUS</span>
                        <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vpradius" data-dir="-1">−</button>
                        <input type="number" id="_vpradius" value="30" min="1" class="_vpnum">
                        <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vpradius" data-dir="1">+</button>
                    </div>
                </div>
                <div class="_vpsort-risk">
                    <div class="_vpsort-wrap">
                        <select id="_vpsort-order" class="_vpselect-sm">
                            <option value="combined">Sort · Best score</option>
                            <option value="res">Sort · Net resources</option>
                            <option value="rpm">Sort · Res / minute</option>
                            <option value="dist">Sort · Distance</option>
                            <option value="reshp">Sort · Res / HP</option>
                        </select>
                    </div>
                    <div class="_vprisk-slider">
                        <input type="range" id="_vprisk" min="1" max="5" value="3" step="1" class="_vpslider">
                        <span id="_vprisk-label" class="_vprisk-label _vprisk-3">Balanced</span>
                    </div>
                </div>
            </div>

            <select id="_vpmode">
                <option value="GRID">Discovery</option>
                <option value="DB">Update</option>
            </select>
            <input type="hidden" id="_vpcoords" value="">
            <input type="hidden" id="_vphero-off" value="2500">
            <input type="hidden" id="_vpdmg-red" value="0">
            <input type="hidden" id="_vpspeed" value="7">
            <input type="hidden" id="_vphero-mounted" value="1">

            <div class="_vptabs">
                <div class="_vptab-track">
                    <button class="_vptab active" data-tab="hero">Hero</button>
                    <button class="_vptab" data-tab="troops">Troops</button>
                </div>
            </div>

            <div class="_vptab-content" id="_vptab-hero">
                <div class="_vphero-summary">
                    <div class="_vphero-summary-text">
                        <div class="_vphero-line">
                            <span class="_vphero-off" id="_vphero-off-disp">2500</span>
                            <span class="_vphero-sub" id="_vphero-sub">off · 100% HP · TS 0</span>
                        </div>
                        <div class="_vphero-tier" id="_vphero-tier-disp">Map bonus tier 0</div>
                    </div>
                    <button type="button" id="_vphero-adjust" class="_vpbtn-adjust">Adjust</button>
                    <button id="_vpsync-hero" class="_vpbtn-fetch">Fetch</button>
                </div>
                <div class="_vphero-cards" id="_vphero-cards" style="display:none">
                    <div class="_vphero-card">
                        <div class="_vphero-card-label">HEALTH</div>
                        <div class="_vpstepper">
                            <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vpmax-hp" data-dir="-1">−</button>
                            <input type="number" id="_vpmax-hp" value="100" min="1" max="100" class="_vpnum">
                            <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vpmax-hp" data-dir="1">+</button>
                        </div>
                    </div>
                    <div class="_vphero-card">
                        <div class="_vphero-card-label">TS LEVEL</div>
                        <div class="_vpstepper">
                            <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vpts-lvl" data-dir="-1">−</button>
                            <input type="number" id="_vpts-lvl" value="0" min="0" max="20" class="_vpnum">
                            <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vpts-lvl" data-dir="1">+</button>
                        </div>
                    </div>
                    <div class="_vphero-card">
                        <div class="_vphero-card-label">MAP TIER</div>
                        <div class="_vpstepper">
                            <button type="button" class="_vpstep-btn _vpstep-down" data-target="_vphero-map" data-dir="-1">−</button>
                            <input type="number" id="_vphero-map" value="0" min="0" max="3" class="_vpnum" title="Map tier: 0=none, 1=30%, 2=40%, 3=50% return speed bonus">
                            <button type="button" class="_vpstep-btn _vpstep-up" data-target="_vphero-map" data-dir="1">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="_vptab-content" id="_vptab-troops" style="display:none">
                <div id="_vptroop-warn" class="_vpwarn-banner" style="display:none">
                    Tribe not detected. Visit your profile page first.
                </div>
                <div class="_vptribe-row">
                    <span id="_vptribe-badge" class="_vptribe-badge" style="display:none"></span>
                    <span id="_vpserver-badge" class="_vpserver-badge" style="display:none"></span>
                    <label class="_vphero-switch">
                        <input type="checkbox" id="_vptroop-hero">
                        <span class="_vpswitch"><span class="_vpswitch-knob"></span></span>
                        include hero
                    </label>
                </div>
                <div class="_vptroop-actions">
                    <button id="_vpfetch-troops" class="_vpbtn-mini" style="display:none" title="Read troop counts and smithy levels from this village">Fetch Troops</button>
                    <button id="_vpclear-troops" class="_vpbtn-mini _vpbtn-mini-dim" style="display:none">None</button>
                </div>
                <div class="_vptroop-extra" id="_vppreview-unit-row" style="display:none">
                    <label>Preview</label>
                    <select id="_vppreview-unit" class="_vpselect-sm">
                        <option value="fastest">Fastest unit</option>
                    </select>
                </div>
                <div class="_vptroop-extra" id="_vpmax-troops-row" style="display:none">
                    <label>Max troops</label>
                    <div class="_vpstepper _vpstepper-box"><button type="button" class="_vpstep-btn _vpstep-down" data-target="_vpmax-troops" data-dir="-50">−</button><input type="number" id="_vpmax-troops" value="0" min="0" step="50" class="_vpnum" title="Cap troops sent in preview (0 = no cap)"><button type="button" class="_vpstep-btn _vpstep-up" data-target="_vpmax-troops" data-dir="50">+</button></div>
                </div>
                <div id="_vpunit-grid" class="_vpunit-grid"></div>
            </div>

            <div class="_vpcov-section">
                <div class="_vpcov-meter" id="_vpcov-meter" title="Pan the map to scan oases">
                    <div class="_vpcov-fill" id="_vpcov-fill"></div>
                    <span class="_vpcov-label" id="_vpcov-label">Pan map to scan</span>
                </div>
            </div>

            <div id="_vpresults-container" class="_vpresults"></div>

            <div class="_vpfooter _vpactions">
                <button id="_vpclear-db" class="_vpbtn _vpbtn-sm">Clear DB</button>
                <button id="_vperrors-btn" class="_vpbtn _vpbtn-warn">Errors</button>
                <button id="_vpview-db" class="_vpbtn _vpbtn-sm">View DB</button>
                <span id="_vpdb-count" class="_vpdb-count">0 stored</span>
            </div>
        </div>

        <div id="_vpdb-modal" class="_vpmodal">
            <div class="_vpmodal-dialog">
                <div class="_vpmodal-header">
                    <div class="_vplogo"></div>
                    <span id="_vpmodal-title" class="_vpmodal-title">OASIS DATABASE</span>
                    <span id="_vpmodal-count" class="_vpmodal-count"></span>
                    <button class="_vpmodal-close" id="_vpdb-close">✕</button>
                </div>
                <div class="_vpmodal-colhead">
                    <span class="_vpcol-loc">Location</span>
                    <span class="_vpcol-dist">Dist</span>
                    <span class="_vpcol-gar">Garrison</span>
                </div>
                <div id="_vpdb-list" class="_vpmodal-list"></div>
                <div class="_vpmodal-footer">
                    <span class="_vpmodal-foot-note">Synced from map scans</span>
                    <button id="_vpmodal-clear" class="_vpmodal-clear">Clear all</button>
                </div>
            </div>
        </div>
    `;
  document.body.appendChild(div);

  const coordsInput = document.getElementById("_vpcoords");

  // Auto-select current village and set coords
  updateVillageDropdown();
  buildUnitGrid();

  document.getElementById("_vpcollapse").addEventListener("click", () => {
    const body = document.getElementById("_vpbody");
    const btn = document.getElementById("_vpcollapse");
    const collapsed = body.style.display === "none";
    body.style.display = collapsed ? "" : "none";
    btn.textContent = collapsed ? "−" : "+";
  });

  // Drag the whole panel by its header
  makePanelDraggable(div, div.querySelector("._vpheader"));

  // Density toggle (CSS-driven; persisted setting)
  div.querySelector("._vpdensity").addEventListener("click", (e) => {
    const btn = e.target.closest("._vpdens-btn");
    if (btn) setDensity(btn.dataset.density, true);
  });

  // Mode segmented control writes the value the logic reads (#_vpmode select)
  div.querySelector("._vpmode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("._vpseg-btn");
    if (!btn) return;
    const modeSel = document.getElementById("_vpmode");
    modeSel.value = btn.dataset.mode;
    updateModeButtons();
    modeSel.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Hero "Adjust" toggles the stepper card grid
  document.getElementById("_vphero-adjust").addEventListener("click", () => {
    const cards = document.getElementById("_vphero-cards");
    const btn = document.getElementById("_vphero-adjust");
    const open = cards.style.display !== "none";
    cards.style.display = open ? "none" : "";
    btn.textContent = open ? "Adjust" : "Done";
  });

  // Stepper buttons for panel inputs (Radius, Health, TS Level, Map Tier)
  div.addEventListener("click", (e) => {
    const btn = e.target.closest("._vpstep-btn");
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const dir = parseInt(btn.dataset.dir);
    const min = parseInt(input.min) || 0;
    const max = input.max !== "" ? parseInt(input.max) : Infinity;
    const cur = parseInt(input.value) || 0;
    input.value = Math.max(min, Math.min(max, cur + dir));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  div.querySelector("._vptabs").addEventListener("click", (e) => {
    const btn = e.target.closest("._vptab");
    if (!btn) return;
    div
      .querySelectorAll("._vptab")
      .forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("_vptab-hero").style.display =
      tab === "hero" ? "" : "none";
    document.getElementById("_vptab-troops").style.display =
      tab === "troops" ? "" : "none";
    setPanelTab(tab);
    saveSettings();
    renderResults();
  });

  const vSelect = document.getElementById("_vpvillage-select");
  vSelect.addEventListener("change", () => {
    if (vSelect.value && vSelect.value.includes("|")) {
      coordsInput.value = escapeHTML(vSelect.value);
      saveSettings();
      renderResults();
      updateCoverageDisplay();
    }
  });

  coordsInput.addEventListener("input", () => {
    vSelect.value = "";
  });

  const settingIds = [
    "_vpradius",
    "_vpmax-hp",
    "_vpmax-troops",
    "_vpts-lvl",
    "_vpcoords",
    "_vpmode",
    "_vpsort-order",
    "_vphero-map",
    "_vprisk",
  ];

  // Risk slider label update
  const riskSlider = document.getElementById("_vprisk");
  const riskLabel = document.getElementById("_vprisk-label");
  if (riskSlider && riskLabel) {
    const updateRiskLabel = () => {
      const lvl = parseInt(riskSlider.value);
      riskLabel.textContent = getRiskThresholds(lvl).label;
      riskLabel.className = "_vprisk-label _vprisk-" + lvl;
    };
    riskSlider.addEventListener("input", updateRiskLabel);
    updateRiskLabel();
    // Travian's map handlers swallow mousemove/up on document, killing the
    // drag mid-stroke. setPointerCapture re-routes all pointer events for the
    // active drag straight to the slider, bypassing the document listeners.
    riskSlider.addEventListener("pointerdown", (e) => {
      try {
        riskSlider.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    [
      "mousedown",
      "mousemove",
      "mouseup",
      "pointerdown",
      "pointermove",
      "pointerup",
      "touchstart",
      "touchmove",
      "touchend",
      "click",
    ].forEach((evt) => {
      riskSlider.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  settingIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        saveSettings();
        renderResults();
        if (id === "_vpradius" || id === "_vpcoords") updateCoverageDisplay();
      });
      el.addEventListener("change", () => {
        saveSettings();
        renderResults();
        if (id === "_vpradius" || id === "_vpcoords") updateCoverageDisplay();
      });
    }
  });

  document.getElementById("_vptroop-hero").addEventListener("change", () => {
    saveSettings();
    renderResults();
  });

  document.getElementById("_vpclear-db").onclick = clearDatabase;
  document.getElementById("_vperrors-btn").onclick = showErrors;
  document.getElementById("_vpview-db").onclick = viewDatabase;
  document.getElementById("_vpdb-close").onclick = closeDatabaseView;
  document.getElementById("_vpmodal-clear").onclick = clearDatabase;

  // Click the dimmed backdrop (but not the dialog) to close the modal
  const dbModal = document.getElementById("_vpdb-modal");
  dbModal.addEventListener("click", (e) => {
    if (e.target === dbModal) closeDatabaseView();
  });

  document.getElementById("_vpsync-hero").onclick = () => syncHeroStats(true);

  // Restore mode/DB first: incoming Discovery data must not bypass saved Update mode.
  Promise.allSettled([loadSettings(), loadDatabase(), loadScanData()]).then((loads) => {
    if (loads.some(load => load.status === "rejected")) {
      console.warn("OasisCalc: some saved data could not be loaded; storage writes remain guarded.");
    }
    flushPendingTiles();
    updateCoverageDisplay();
    updateModeButtons();
    renderResults();
    syncHeroStats();
  });
  // Only refresh display text; this timer makes no game requests or actions.
  const ageTimer = setInterval(() => {
    if (!div.isConnected) { clearInterval(ageTimer); return; }
    if (!document.hidden) refreshObservationAges();
  }, 60000);
}
