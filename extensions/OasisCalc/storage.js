/**
 * storage.js — browser.storage.local persistence and DB/settings UI modals
 */

// INVARIANT: saveDatabase() must never run before loadDatabase() resolves.
// bridge.js intercepts tiles immediately at page load — if a tile batch arrives
// before the async load completes, saveDatabase() would persist a near-empty
// knownOases, wiping all stored oases. Set true only inside loadDatabase().then().
let _dbLoaded = false;

// INVARIANT: saveScanData() must never run before loadScanData() resolves.
// Same race: early tile batches would persist an empty resultsMap over history.
let _scanLoaded = false;

let _scanSaveTimer = 0;
function saveScanData() {
  // INVARIANT: never remove this guard — see learnings.md storage-corruption entries
  if (!_scanLoaded) return;
  clearTimeout(_scanSaveTimer);
  _scanSaveTimer = setTimeout(() => {
    const obj = {};
    obj[SCAN_DATA_KEY] = Array.from(resultsMap.entries());
    browser.storage.local.set(obj);
  }, 2000);
}

function loadScanData() {
  _scanLoaded = false;
  return browser.storage.local.get(SCAN_DATA_KEY).then((data) => {
    if (data && data[SCAN_DATA_KEY]) {
      // Merge into resultsMap — do not replace. Live tile data may have already
      // arrived; replacing would discard it.
      for (const entry of Array.isArray(data[SCAN_DATA_KEY]) ? data[SCAN_DATA_KEY] : []) {
        if (!Array.isArray(entry)) continue;
        const [k, v] = entry;
        if (!v || !Number.isSafeInteger(v.x) || !Number.isSafeInteger(v.y) ||
            k !== `${v.x}|${v.y}` || !Array.isArray(v.animals) || !v.animals.length ||
            !v.animals.every(a => a && Number.isInteger(a.id) && ANIMAL_STATS[a.id] && Number.isSafeInteger(a.count) && a.count > 0)) continue;
        if (!resultsMap.has(k) && !resolvedOases.has(k)) resultsMap.set(k, v);
      }
      if (resultsMap.size > 0) {
        log(`Restored ${resultsMap.size} results.`);
        renderResults();
      }
    }
    _scanLoaded = true;
    saveScanData();
  });
}

function loadDatabase() {
  _dbLoaded = false;
  return browser.storage.local.get(STORAGE_KEY).then((data) => {
    if (data && data[STORAGE_KEY]) {
      // Merge — do not replace. Live tile batches may have already populated
      // knownOases before this resolves; replacing would wipe them.
      for (const k of Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []) {
        if (typeof k === "string" && /^-?\d+\|-?\d+$/.test(k)) knownOases.add(k);
      }
      updateDBCount();
    }
    _dbLoaded = true;
    saveDatabase();
  });
}

function saveDatabase() {
  // INVARIANT: never remove this guard — see learnings.md storage-corruption entries
  if (!_dbLoaded) return;
  const obj = {};
  obj[STORAGE_KEY] = Array.from(knownOases);
  browser.storage.local.set(obj);
  updateDBCount();
}

// Oasis bonuses never change, so unlike the DB and scan data they are merged
// into storage on write instead of loaded first: there is no load race to
// guard. Saved once per map response rather than debounced — continuous
// panning kept resetting a debounce, so leaving the map right after a pan
// lost everything. Writes are chained so back-to-back responses can't each
// merge into the same stale copy and drop the other's finds.
let _bonusWrite = Promise.resolve();
function saveOasisBonuses(batch) {
  _bonusWrite = _bonusWrite
    .then(() => browser.storage.local.get(BONUS_KEY))
    .then((data) => {
      const stored = data?.[BONUS_KEY] || {};
      if (Object.keys(batch).every(k => stored[k] === batch[k])) return;
      return browser.storage.local.set({ [BONUS_KEY]: { ...stored, ...batch } });
    })
    .catch(() => {});
  return _bonusWrite;
}

function clearDatabase() {
  if (confirm("Delete entire database?")) {
    knownOases.clear();
    saveDatabase();
    log("Database wiped.");
  }
}

function updateDBCount() {
  const el = document.getElementById("_vpdb-count");
  if (el) el.innerText = `${knownOases.size} stored`;
  const modalCount = document.getElementById("_vpmodal-count");
  if (modalCount) modalCount.innerText = `${knownOases.size} stored`;
}

function showErrors() {
  const modal = document.getElementById("_vpdb-modal");
  const list = document.getElementById("_vpdb-list");
  document.getElementById("_vpmodal-title").innerText = "SKIPPED & ERRORS";
  const modalCount = document.getElementById("_vpmodal-count");
  if (modalCount) modalCount.innerText = `${skippedOases.length} skipped`;
  // The Location · Dist · Garrison column header is meaningless here.
  const colhead = document.querySelector("._vpmodal-colhead");
  if (colhead) colhead.style.display = "none";

  list.innerHTML = "";
  let html = "";

  if (skippedOases.length > 0) {
    skippedOases.forEach((o) => {
      html += `
                <div class="_vpmodal-item">
                    <a href="/position_details.php?x=${escapeHTML(o.x)}&y=${escapeHTML(o.y)}" target="_blank" class="_vpmodal-coords">${escapeHTML(o.x)}|${escapeHTML(o.y)}</a>
                    <span class="_vpmodal-gar _vpresult-xp">${escapeHTML(o.reason)}</span>
                </div>
            `;
    });
  }

  if (html === "") {
    html = '<div class="_vpresults-empty">No errors or skipped items yet.</div>';
  }

  list.innerHTML = html;
  modal.style.display = "flex";
}

function viewDatabase() {
  const modal = document.getElementById("_vpdb-modal");
  const list = document.getElementById("_vpdb-list");
  document.getElementById("_vpmodal-title").innerText = "OASIS DATABASE";
  const modalCount = document.getElementById("_vpmodal-count");
  if (modalCount) modalCount.innerText = `${knownOases.size} stored`;
  const colhead = document.querySelector("._vpmodal-colhead");
  if (colhead) colhead.style.display = "";

  const { cx, cy } = getCoords();
  list.innerHTML = "";
  let arr = Array.from(knownOases).map((key) => {
    const [ox, oy] = key.split("|").map(Number);
    const dx = torusDelta(ox, cx);
    const dy = torusDelta(oy, cy);
    const dist = Math.sqrt(dx * dx + dy * dy).toFixed(1);
    // Garrison comes from the live results map (animal data); fall back to "—"
    // for oases known only by location (never scanned with animals this session).
    const entry = resultsMap.get(key);
    const garrison =
      entry && entry.animals && entry.animals.length
        ? entry.animals
            .map((a) => `${a.count} ${ANIMAL_STATS[a.id]?.name || a.id}`)
            .join(" · ")
        : "—";
    return { x: ox, y: oy, dist: parseFloat(dist), garrison };
  });
  arr.sort((a, b) => a.dist - b.dist);
  if (arr.length === 0) {
    list.innerHTML = '<div class="_vpresults-empty">Empty</div>';
  } else {
    arr.forEach((o) => {
      const row = document.createElement("div");
      row.className = "_vpmodal-item";
      row.innerHTML = `<a href="/position_details.php?x=${escapeHTML(o.x)}&y=${escapeHTML(o.y)}" target="_blank" class="_vpmodal-coords">${escapeHTML(o.x)}|${escapeHTML(o.y)}</a><span class="_vpmodal-dist">${escapeHTML(o.dist)}</span><span class="_vpmodal-gar">${escapeHTML(o.garrison)}</span>`;
      list.appendChild(row);
    });
  }
  modal.style.display = "flex";
}

function closeDatabaseView() {
  document.getElementById("_vpdb-modal").style.display = "none";
}

async function fetchVillageTroops(did) {
  const dorfUrl = did ? `/dorf1.php?newdid=${did}` : "/dorf1.php";
  // Navigate to village overview first — creates a real referrer chain
  await sleep(200 + Math.random() * 400);
  await fetch(dorfUrl, {
    credentials: "include",
    referrer: location.href,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": navigator.language || "en-US,en;q=0.9",
    },
  });

  await sleep(500 + Math.random() * 700);
  const base = "/build.php?gid=16&tt=1&filter=3";
  const url = did ? `${base}&newdid=${did}` : base;
  const res = await fetch(url, {
    credentials: "include",
    referrer: location.origin + dorfUrl,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": navigator.language || "en-US,en;q=0.9",
    },
  });
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  const troops = {};

  // Find the "Own troops" section: thead with link to /profile/, followed by tbody.units rows
  // Row #unitRowAtTown has unit icons (img.unit.u1 .. u10), next tbody.units.last has counts
  const iconRow = doc.getElementById("unitRowAtTown");
  if (!iconRow) return troops;

  // Map column index → unit id from the icon row
  const colMap = [];
  iconRow.querySelectorAll("td.uniticon").forEach((td, idx) => {
    const img = td.querySelector("img.unit");
    if (!img) return;
    const m = img.className.match(/\bu(\d+)\b/);
    if (m) colMap[idx] = parseInt(m[1], 10);
  });

  // The count row is in the next tbody.units.last
  const countRow = iconRow
    .closest("tbody")
    ?.nextElementSibling?.querySelector("tr");
  if (!countRow) return troops;

  countRow.querySelectorAll("td.unit").forEach((td, idx) => {
    const uX = colMap[idx];
    if (!uX || uX > 80) return;
    const num = parseInt(td.textContent.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num > 0) {
      const storageKey = `${Math.ceil(uX / 10)}-${((uX - 1) % 10) + 1}`;
      troops[storageKey] = num;
    }
  });

  return troops;
}

/**
 * Reads the per-unit upgrade levels off the village smithy page (gid=13).
 * Returns null when the levels can't be read — no smithy in this village, or
 * the page didn't parse — so callers leave any stored levels alone rather than
 * zeroing them out.
 * @param {string|number} did - village id, or falsy for the active village
 * @returns {Promise<Object<string, number>|null>} unit id ("u1") → level
 */
async function fetchVillageSmithy(did) {
  await sleep(500 + Math.random() * 700);
  const base = "/build.php?gid=13";
  const url = did ? `${base}&newdid=${did}` : base;
  const res = await fetch(url, {
    credentials: "include",
    referrer: location.origin + "/dorf2.php",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": navigator.language || "en-US,en;q=0.9",
    },
  });
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "text/html");

  const container = doc.getElementById("build") || doc;
  const levels = {};

  container.querySelectorAll("img.unit").forEach((img) => {
    const m = img.className.match(/\bu(\d+)\b/);
    if (!m) return;
    const uX = parseInt(m[1], 10);
    if (!uX || uX > 80) return;

    // Walk up from the icon to the unit's card and take the level shown there.
    // Units still at level 0 render no level marker, so they stay absent and
    // fall back to 0 on prefill.
    let node = img.parentElement;
    for (let depth = 0; depth < 4 && node; depth++) {
      const lvlEl = node.querySelector(".level, .unitLevel");
      if (lvlEl) {
        const num = parseInt(lvlEl.textContent.replace(/\D/g, ""), 10);
        if (!isNaN(num)) {
          levels[`u${uX}`] = Math.max(0, Math.min(20, num));
          return;
        }
      }
      node = node.parentElement;
    }
  });

  // Nothing parsed means no smithy here, or markup we don't recognise. Either
  // way, report failure so hand-entered levels survive rather than being
  // silently reset to 0.
  return Object.keys(levels).length ? levels : null;
}

async function fetchAndStoreTroops() {
  const btn = document.getElementById("_vpfetch-troops");
  try {
    const village = getActiveVillage();
    if (!village) return;

    // Loading feedback while the village-overview fetch is in flight
    if (btn) {
      btn.textContent = "Fetching…";
      btn.disabled = true;
    }

    const troops = await fetchVillageTroops(village.did);
    const smithy = await fetchVillageSmithy(village.did);

    // Merge into existing map so other villages' stored data is preserved
    const data = await browser.storage.local.get([TROOPS_KEY, SMITHY_KEY]);
    const troopsMap = data[TROOPS_KEY] || {};
    troopsMap[village.name] = troops;
    const obj = {};
    obj[TROOPS_KEY] = troopsMap;

    if (smithy) {
      const smithyMap = data[SMITHY_KEY] || {};
      smithyMap[village.name] = smithy;
      obj[SMITHY_KEY] = smithyMap;
    }
    browser.storage.local.set(obj);

    prefillTroopsFromStorage(village.name);
    if (btn) btn.textContent = "Fetched ✓";
  } catch (_) {
    if (btn) btn.textContent = "Failed";
  } finally {
    if (btn) {
      btn.disabled = false;
      setTimeout(() => {
        if (btn) btn.textContent = "Fetch Troops";
      }, 1800);
    }
  }
}

// Persisted text/number inputs and selects. _vpcoords is saved but not
// restored on load — village auto-detection repopulates it.
const SETTING_FIELDS = [
  "_vpradius",
  "_vphero-off",
  "_vpdmg-red",
  "_vphero-mounted",
  "_vpmax-hp",
  "_vpts-lvl",
  "_vpspeed",
  "_vpcoords",
  "_vpmode",
  "_vpsort-order",
  "_vphero-map",
  "_vprisk",
];

function saveSettings() {
  const settings = {};
  SETTING_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) settings[id] = el.value;
  });

  const heroCheck = document.getElementById("_vptroop-hero");
  if (heroCheck) settings["_vptroop-hero"] = heroCheck.checked;

  const activeTab =
    document.querySelector("._vptab.active")?.dataset.tab || "hero";
  settings["_vpactive-tab"] = activeTab;

  // Density is a panel class, not an input — persist it explicitly.
  settings["_vpdensity"] = getDensity();

  // Persist the dragged panel position (set as inline left/top while dragging).
  const panel = document.getElementById("_vppanel");
  if (panel && panel.style.left) {
    settings["_vppos"] = { left: panel.style.left, top: panel.style.top };
  }

  const previewUnit = document.getElementById("_vppreview-unit");
  if (previewUnit) settings["_vppreview-unit"] = previewUnit.value;

  settings["_vpdisabled-units"] = Array.from(disabledUnits);

  const tribeId = detectTribe();
  if (tribeId && TROOP_DATA[tribeId]) {
    TROOP_DATA[tribeId].units.forEach((unit) => {
      const el = document.getElementById(`_vptroop-${unit.id}`);
      if (el) settings[`_vptroop-${unit.id}`] = el.value;
    });
  }

  const obj = {};
  obj[SETTINGS_KEY] = settings;
  browser.storage.local.set(obj);

  // Save smithy levels per village
  saveSmithyForCurrentVillage();
}

function saveSmithyForCurrentVillage() {
  const tribeId = detectTribe();
  if (!tribeId || !TROOP_DATA[tribeId]) return;

  const matched = getActiveVillage();
  if (!matched) return;

  const smithyLevels = {};
  TROOP_DATA[tribeId].units.forEach((unit) => {
    const el = document.getElementById(`_vpsmithy-${unit.id}`);
    if (el) smithyLevels[unit.id] = el.value;
  });

  browser.storage.local.get(SMITHY_KEY).then((data) => {
    const allSmithy = data[SMITHY_KEY] || {};
    allSmithy[matched.name] = smithyLevels;
    const obj = {};
    obj[SMITHY_KEY] = allSmithy;
    browser.storage.local.set(obj);
  });
}

function loadSettings() {
  return browser.storage.local.get(SETTINGS_KEY).then((data) => {
    if (!data || !data[SETTINGS_KEY]) return;
    const settings = data[SETTINGS_KEY];

    // Restore all settings except coords — active village detection handles that
    SETTING_FIELDS.forEach((id) => {
      if (id === "_vpcoords") return;
      const el = document.getElementById(id);
      if (el && settings[id] !== undefined) el.value = settings[id];
    });

    const heroCheck = document.getElementById("_vptroop-hero");
    if (heroCheck && settings["_vptroop-hero"] !== undefined)
      heroCheck.checked = settings["_vptroop-hero"];

    const savedTab = settings["_vpactive-tab"] || "hero";
    document.querySelectorAll("._vptab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === savedTab);
    });
    document.getElementById("_vptab-hero").style.display =
      savedTab === "hero" ? "" : "none";
    document.getElementById("_vptab-troops").style.display =
      savedTab === "troops" ? "" : "none";
    setPanelTab(savedTab);

    const previewUnit = document.getElementById("_vppreview-unit");
    if (previewUnit && settings["_vppreview-unit"])
      previewUnit.value = settings["_vppreview-unit"];

    // Restore disabled units and reflect them on the (already built) unit grid
    if (Array.isArray(settings["_vpdisabled-units"])) {
      disabledUnits = new Set(settings["_vpdisabled-units"]);
      document.querySelectorAll("._vpunit-cell").forEach((cell) => {
        cell.classList.toggle(
          "unit-disabled",
          disabledUnits.has(cell.dataset.unitId),
        );
      });
    }

    // Restore density (panel class) and sync the mode segmented buttons + hero summary
    setDensity(settings["_vpdensity"] || "normal");
    updateModeButtons();
    updateHeroSummary();

    // Restore a previously dragged panel position
    if (settings["_vppos"]) {
      const panel = document.getElementById("_vppanel");
      if (panel) {
        panel.style.left = settings["_vppos"].left;
        panel.style.top = settings["_vppos"].top;
        panel.style.right = "auto";
      }
    }

    // Prefill troop inputs and smithy levels from stored data for the active village
    const matched = getActiveVillage();
    if (matched) prefillTroopsFromStorage(matched.name);

    // Update risk slider label + color after restoring value
    const riskLabel = document.getElementById("_vprisk-label");
    const riskSlider = document.getElementById("_vprisk");
    if (riskLabel && riskSlider) {
      const lvl = parseInt(riskSlider.value);
      riskLabel.textContent = getRiskThresholds(lvl).label;
      riskLabel.className = "_vprisk-label _vprisk-" + lvl;
    }
  });
}
