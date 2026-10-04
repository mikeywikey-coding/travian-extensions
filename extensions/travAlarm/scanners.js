/**
 * TRAVIAN WATCHMAN PRO - SCANNERS
 */

// ==========================================
// SCAN UTILITIES
// ==========================================

/** Extracts a village name from a table row, checking .vil then td:first-child. */
function getVillageNameFromRow(row) {
  const vilCell =
    row.querySelector(".vil") || row.querySelector("td:first-child");
  if (!vilCell) return "Village";
  const a = vilCell.querySelector("a");
  return cleanText((a ?? vilCell).innerText);
}

const NPC_MSG_STYLE =
  "display: inline-block; font-family: Arial, Helvetica, Verdana, sans-serif; font-size: 12px; color: #777777; font-weight: bold; margin-left: 10px; white-space: nowrap;";

function isResourcesPage() {
  const href = window.location.href;
  const search = window.location.search;
  return (
    href.includes("/village/statistics/resources") ||
    (href.includes("dorf3.php") &&
      (search.includes("s=0") || !search.includes("s=")))
  );
}

/** Calls fn(...args) swallowing any thrown error — scan errors are non-critical. */
function tryScan(fn, ...args) {
  try {
    return fn(...args);
  } catch {
    return null;
  }
}

// ==========================================
// CORE LOGIC: MAIN SCAN LOOP
// ==========================================

function scan() {
  if (typeof timerWidget !== "undefined" && timerWidget) {
    const isMap = window.location.pathname.includes("karte.php");
    const isFull =
      new URLSearchParams(window.location.search).get("fullscreen") === "1";
    timerWidget.style.display = isMap && isFull ? "none" : "";
  }

  try {
    const villageMap = scanVillages();
    const activeVillage = getActiveVillageName();
    const found = [];
    let matchedBuildingIds = null;

    scanProduction(activeVillage);
    scanNPCBuild(activeVillage);

    const scanResult = tryScan(scanBuildings, activeVillage);
    if (scanResult) {
      found.push(...scanResult.newBuildings);
      matchedBuildingIds = scanResult.matchedIds;
    }

    const resStatus = tryScan(scanResources);
    if (resStatus && resStatus.length > 0) found.push(...resStatus);

    // Deep Attack Scanner
    tryScan(scanForSidebarAttacksAndFetch);

    // Training queue on-page trigger
    const isTrainingStatsPage = window.location.pathname.includes(
      "/village/statistics/troops/training",
    );
    const isTrainingBuildingPage =
      window.location.pathname.includes("build.php") &&
      !!document.querySelector(".trainBuilding");
    if (isTrainingStatsPage || isTrainingBuildingPage) {
      tryScan(fetchTrainingData);
    }

    // Settler/Chieftain training on-page trigger (Residence/Palace only —
    // expansion units never appear on the troops training statistics page)
    if (window.location.pathname.includes("build.php")) {
      tryScan(scanSettlerTraining, activeVillage);
    }

    // Celebrations on-page trigger
    const isCpPage =
      window.location.href.includes("/village/statistics/culturepoints") ||
      (window.location.href.includes("dorf3.php") &&
        window.location.search.includes("s=2"));
    if (isCpPage) tryScan(fetchCelebrationsData);

    // Storage on-page trigger
    if (isResourcesPage()) tryScan(fetchWarehouseData);

    if (matchedBuildingIds) handleQueueCleanup(matchedBuildingIds, activeVillage);
    if (found.length > 0)
      api.runtime.sendMessage({ type: "REFRESH_ALARMS", buildings: found });
  } catch {}
}

// ==========================================
// SCANNERS
// ==========================================

function scanProduction(activeVillage) {
  if (!window.location.pathname.includes("dorf1.php")) return;
  const table = document.getElementById("production");
  if (!table) return;
  const rows = table.querySelectorAll("tbody tr");
  let total = 0;
  const prodMap = { w: 0, c: 0, i: 0, cr: 0 };
  rows.forEach((row) => {
    const numCell = row.querySelector(".num");
    if (numCell) {
      const val = parseInt(
        numCell.innerText.replace("−", "-").replace(/[^0-9-]/g, ""),
        10,
      );
      if (!isNaN(val)) {
        total += val;
        if (row.querySelector(".r1") || row.querySelector(".wood"))
          prodMap.w = val;
        else if (row.querySelector(".r2") || row.querySelector(".clay"))
          prodMap.c = val;
        else if (row.querySelector(".r3") || row.querySelector(".iron"))
          prodMap.i = val;
        else if (row.querySelector(".r4") || row.querySelector(".crop"))
          prodMap.cr = val;
      }
    }
  });
  if (activeVillage) {
    localStorage.setItem(`_wpt_${serverTag}_${activeVillage}`, total);
    localStorage.setItem(
      `_wpm_${serverTag}_${activeVillage}`,
      JSON.stringify(prodMap),
    );
  }
}

function scanNPCBuild(activeVillage) {
  const url = window.location.href.toLowerCase();
  if (url.includes("report") || url.includes("berichte.php")) return;
  const costWrappers = Array.from(document.querySelectorAll(
    ".resourceWrapper, .contractCosts, .showCosts",
  )).filter(el => !el.closest('.dialog'));
  if (costWrappers.length === 0) return;

  const l1 = parseInt(
    document.getElementById("l1")?.innerText.replace(/\D/g, "") || "0",
  );
  const l2 = parseInt(
    document.getElementById("l2")?.innerText.replace(/\D/g, "") || "0",
  );
  const l3 = parseInt(
    document.getElementById("l3")?.innerText.replace(/\D/g, "") || "0",
  );
  const l4 = parseInt(
    document.getElementById("l4")?.innerText.replace(/\D/g, "") || "0",
  );
  const currentTotal = l1 + l2 + l3 + l4;

  const prodTotalRaw = localStorage.getItem(
    `_wpt_${serverTag}_${activeVillage}`,
  );
  const prodTotal = parseInt(prodTotalRaw || "0", 10);

  if (!prodTotalRaw) {
    fetchProductionData();
  }

  costWrappers.forEach((wrapper) => {
    if (wrapper.dataset._wnpc === "true") return;

    const c1 = getResourceValue(wrapper, "r1");
    const c2 = getResourceValue(wrapper, "r2");
    const c3 = getResourceValue(wrapper, "r3");
    const c4 = getResourceValue(wrapper, "r4");
    const costTotal = c1 + c2 + c3 + c4;

    if (costTotal === 0) return;
    if (currentTotal >= costTotal) {
      wrapper.dataset._wnpc = "true";
      return;
    }

    let sibling = wrapper.nextElementSibling;
    while (
      sibling &&
      (sibling.tagName === "INPUT" || sibling.classList.contains("clear"))
    ) {
      sibling = sibling.nextElementSibling;
    }

    let durationNode = null;
    let infoNode = null;
    if (
      sibling &&
      (sibling.classList.contains("duration") ||
        sibling.querySelector(".clock") ||
        sibling.querySelector('img[class*="clock"]'))
    ) {
      durationNode = sibling;
      sibling = sibling.nextElementSibling;
      while (
        sibling &&
        (sibling.tagName === "INPUT" || sibling.classList.contains("clear"))
      ) {
        sibling = sibling.nextElementSibling;
      }
    }
    if (sibling) {
      if (
        sibling.classList.contains("errorMessage") ||
        sibling.classList.contains("infoMessage")
      ) {
        infoNode = sibling;
      } else if (sibling.querySelector) {
        infoNode = sibling.querySelector(".errorMessage, .infoMessage");
      }
    }

    let msg = "";
    let isFetching = false;

    if (!prodTotalRaw) {
      msg = "NPC: Fetching Prod...";
      isFetching = true;
    } else if (prodTotal <= 0) {
      if (prodTotal === 0) msg = "NPC: Visit 'Resources' tab";
      else msg = "NPC: Negative Prod";
    } else {
      const missing = costTotal - currentTotal;
      const hours = missing / prodTotal;
      const seconds = Math.ceil(hours * 3600);
      const now = new Date();
      const doneTime = new Date(now.getTime() + seconds * 1000);
      const timeStr = doneTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      msg = `NPC: ${timeStr}`;
    }
    if (!msg) return;

    // Clean up previously injected messages to avoid duplicates
    if (infoNode) {
      infoNode.querySelectorAll("._w-nm").forEach((el) => el.remove());
    } else {
      const target = durationNode || wrapper;
      if (target && target.parentNode) {
        target.parentNode
          .querySelectorAll("._w-nm")
          .forEach((el) => el.remove());
      }
    }

    if (infoNode) {
      const span = document.createElement("span");
      span.className = "_w-nm";
      span.style.cssText = NPC_MSG_STYLE;
      span.innerText = `${msg}`;
      let inserted = false;
      for (const node of infoNode.childNodes) {
        if (
          node.nodeType === 3 &&
          node.textContent.includes("Enough resources")
        ) {
          infoNode.insertBefore(span, node.nextSibling);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        const br = infoNode.querySelector("br");
        if (br) infoNode.insertBefore(span, br);
        else infoNode.appendChild(span);
      }
    } else {
      const target = durationNode || wrapper;
      const errorMsg = target?.parentNode?.querySelector(".errorMessage, .infoMessage");
      if (errorMsg) {
        const span = document.createElement("span");
        span.className = "_w-nm";
        span.style.cssText =
          "display: inline-block; font-family: Arial, Helvetica, Verdana, sans-serif; font-size: 12px; color: #777777; font-weight: bold; margin-left: 10px; white-space: nowrap;";
        span.innerText = msg;
        errorMsg.appendChild(span);
      } else if (target && target.parentNode) {
        const div = document.createElement("div");
        div.className = "_w-nm";
        div.innerText = msg;
        target.parentNode.insertBefore(div, target.nextSibling);
      }
    }

    if (!isFetching) {
      wrapper.dataset._wnpc = "true";
    }
  });
}

function scanResources() {
  if (!isResourcesPage()) return [];

  let newAlarms = [];
  const scannedVillages = new Set();
  const processResourceRow = (vName, cell, icon, name, type, emptyIcon, emptyName) => {
    if (!cell) return;
    let delay = 0;
    const timerSpan = cell.querySelector(".timer");
    if (timerSpan) {
      delay = (timerSpan.getAttribute("value") | 0) * 1000;
    } else {
      const text = cell.innerText.trim();
      if (/\d+:\d+:\d+/.test(text)) delay = parseSmartDuration(text);
    }
    // Travian prefixes depleting crop timers with U+2212 "−"; swap to the empty alarm
    const isDepleting = /^[−-]/.test(cell.innerText.trim());
    if (isDepleting && emptyName) {
      icon = emptyIcon || icon;
      name = emptyName;
    }
    const threshold = type === "storage" ? STORAGE_THRESHOLD : 7200000;
    if (delay > 0 && delay < threshold) {
      const alarmName = `${icon} ${name} | ${vName} ${serverTag}`;
      const newScheduledTime = Date.now() + delay;
      currentAlarms.forEach((a) => {
        if (
          a.name === alarmName &&
          Math.abs(a.scheduledTime - newScheduledTime) > 10000
        ) {
          api.runtime.sendMessage({
            type: "DELETE_ALARM",
            id: a.id,
            name: a.name,
          });
        }
      });
      newAlarms.push({ name: alarmName, delay: delay, customType: type });
    }
  };
  const warehouseTable = document.getElementById("warehouse");
  if (warehouseTable) {
    const rows = warehouseTable.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 7) return;
      const vName = getVillageNameFromRow(row);
      scannedVillages.add(vName);
      processResourceRow(vName, cells[4], "📦", "Warehouse Full", "storage");
      processResourceRow(vName, cells[6], "📦", "Granary Full", "storage", "🌾", "Granary Empty");
    });
    performResourceCleanup(scannedVillages, newAlarms);
    return newAlarms;
  }
  const table =
    document.getElementById("overview") ||
    document.getElementById("resources") ||
    document.querySelector("#content table");
  if (!table) return [];
  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    const vName = getVillageNameFromRow(row);
    scannedVillages.add(vName);
    const resTypes = [
      {
        icon: "🪵",
        name: "Wood",
        selectors: [".lum", ".r1", "td:nth-child(2)"],
      },
      {
        icon: "🧱",
        name: "Clay",
        selectors: [".clay", ".r2", "td:nth-child(3)"],
      },
      {
        icon: "🔩",
        name: "Iron",
        selectors: [".iron", ".r3", "td:nth-child(4)"],
      },
      {
        icon: "🌾",
        name: "Crop",
        selectors: [".crop", ".r4", "td:nth-child(5)"],
      },
    ];
    resTypes.forEach((type) => {
      let cell = row.querySelector(type.selectors[0]);
      if (!cell) cell = row.querySelector(type.selectors[1]);
      if (!cell && !row.querySelector(".lum"))
        cell = row.querySelector(type.selectors[2]);
      if (cell) {
        processResourceRow(vName, cell, type.icon, type.name, "resource");
      }
    });
  });
  performResourceCleanup(scannedVillages, newAlarms);
  return newAlarms;
}

function performResourceCleanup(scannedVillages, newAlarms) {
  const newAlarmNames = new Set(newAlarms.map((a) => a.name));
  const resourceIcons = ["📦", "🌾", "🪵", "🧱", "🔩"];
  currentAlarms.forEach((a) => {
    const isResourceAlarm =
      resourceIcons.some((icon) => a.name.includes(icon)) ||
      a.customType === "storage" ||
      a.name.includes("Full in") ||
      a.name.includes("Empty in");
    if (!isResourceAlarm) return;
    let belongsToScanned = false;
    for (const v of scannedVillages) {
      const marker = `| ${v} ${serverTag}`;
      if (a.name.includes(marker)) {
        belongsToScanned = true;
        break;
      }
    }
    if (belongsToScanned && !newAlarmNames.has(a.name)) {
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name });
    }
  });
}

function scanVillages() {
  const map = {};
  const items = document.querySelectorAll(
    ".villageList li, .villageList .listEntry",
  );
  items.forEach((item) => {
    const nameNode = item.querySelector(".name");
    const coordNode =
      item.querySelector(".coordinates.coordinatesWrapper") ||
      item.querySelector(".coordinatesGrid .coordinatesWrapper");

    // Populate Global Map
    const link = item.querySelector("a");
    let vid = null;
    if (link && link.href) {
      const match = link.href.match(/newdid=(\d+)/);
      if (match) vid = match[1];
    }
    // Fallback: Travian sidebar now exposes vid via `data-did` on the <li>
    // rather than `newdid=` in the href.
    if (!vid) vid = item.getAttribute("data-did") || null;
    if (nameNode && vid) {
      const vName = cleanText(nameNode.innerText);
      globalVillageMap[vid] = vName;
    }

    if (nameNode && coordNode) {
      const vName = cleanText(nameNode.innerText);
      const key = cleanCoords(coordNode.innerText.trim());
      map[key] = vName;
    }
  });
  return map;
}

function getActiveVillageName() {
  const activeNode =
    document.querySelector(".villageList .active .name") ||
    document.querySelector("#sidebarBoxVillagelist .active .name");
  return activeNode ? cleanText(activeNode.innerText) : "Village";
}

function scanBuildings(activeVillage) {
  const buildingList = document.querySelector(".buildingList");
  if (!buildingList) return null;
  const rows = buildingList.querySelectorAll("li, tr");
  const now = Date.now();
  const rawBuildings = [];
  rows.forEach((row) => {
    const t = row.querySelector(".timer");
    if (!t || row.classList.contains("masterBuilder")) return;
    const txt = row.innerText;
    const match = txt.match(/(.*?)\s+Level\s+(\d+)/i);
    const bName = match
      ? cleanText(match[1])
      : cleanText(txt.split("Level")[0]);
    const bLevel = match ? match[2].trim() : "";
    const delayValue = (t.getAttribute("value") | 0) * 1000 + 1700;
    rawBuildings.push({
      bName,
      bLevel,
      baseName: `${bName} lvl ${bLevel} (${activeVillage}) ${serverTag}`,
      delay: delayValue,
      scheduledTime: now + delayValue,
    });
  });
  rawBuildings.sort((a, b) => a.scheduledTime - b.scheduledTime);
  const nameCounts = {};
  const processedBuildings = rawBuildings.map((b) => {
    if (!nameCounts[b.baseName]) nameCounts[b.baseName] = 0;
    nameCounts[b.baseName]++;
    let finalName = b.baseName;
    if (nameCounts[b.baseName] > 1)
      finalName = `${b.baseName} #${nameCounts[b.baseName]}`;
    return { ...b, name: finalName };
  });
  const newAlarms = [];
  const matchedIds = new Set();
  const usedAlarmIds = new Set();
  processedBuildings.forEach((pb) => {
    const bestMatch = currentAlarms.find((a) => {
      if (usedAlarmIds.has(a.id || a.name)) return false;
      const timeDiff = Math.abs(a.scheduledTime - pb.scheduledTime);
      if (timeDiff > 20000) return false;
      if (a.name.startsWith(pb.baseName)) return true;
      const looseStart = `${pb.bName} lvl `;
      const looseEnd = `(${activeVillage}) ${serverTag}`;
      if (a.name.startsWith(looseStart) && a.name.includes(looseEnd))
        return true;
      return false;
    });
    if (bestMatch) {
      const uid = bestMatch.id || bestMatch.name;
      matchedIds.add(uid);
      usedAlarmIds.add(uid);
      if (bestMatch.name !== pb.name) {
        bestMatch.name = pb.name;
        api.runtime.sendMessage({
          type: "EDIT_ALARM",
          id: bestMatch.id,
          newName: pb.name,
        });
      }
    } else {
      newAlarms.push({ name: pb.name, delay: pb.delay });
    }
  });
  return { newBuildings: newAlarms, matchedIds };
}

// Emojis used in non-building alarm types — skip these during building queue cleanup
const NON_BUILDING_EMOJIS = [
  "⚠️",
  "⚔️",
  "⭐",
  "🌾",
  "📦",
  "🪵",
  "🧱",
  "🔩",
  "🎓",
];

// Settler/Chieftain ("expansion units") training only appears on the
// Residence/Palace build page, inside `.trainExpansionUnits` — never on the
// troops training statistics page that fetchTrainingData() reads. Scan the
// on-page queue directly and emit a 🎓 alarm so it groups with the other
// training alarms in the popup. Uses customType "settler" (not "training") so
// the stats page's CLEAR_STALE_TRAINING can't wipe it.
function scanSettlerTraining(activeVillage) {
  const wrapper = document.querySelector(".trainExpansionUnits");
  if (!wrapper) return;

  const alarmName = `🎓 Settlers (${activeVillage}) ${serverTag}`;

  // Each queued batch row carries a cumulative .timer (seconds until that batch
  // finishes); the largest one is the whole queue's completion time.
  let maxSeconds = 0;
  wrapper.querySelectorAll("table.under_progress .timer").forEach((t) => {
    const s = parseInt(t.getAttribute("value"), 10) || 0;
    if (s > maxSeconds) maxSeconds = s;
  });

  if (maxSeconds > 0) {
    api.runtime.sendMessage({
      type: "REFRESH_ALARMS",
      buildings: [
        { name: alarmName, delay: maxSeconds * 1000, customType: "settler" },
      ],
    });
    return;
  }

  // Empty queue on this village's Residence/Palace → drop a stale future alarm
  // for this village only (can't see other villages from here). Leave already-
  // fired alarms for the user to dismiss, matching the training cleanup.
  const now = Date.now();
  const existing = currentAlarms.find((a) => a.name === alarmName);
  if (existing && existing.scheduledTime - now > 10000) {
    api.runtime.sendMessage({
      type: "DELETE_ALARM",
      id: existing.id,
      name: existing.name,
    });
  }
}

function handleQueueCleanup(matchedIds, activeVillage) {
  const now = Date.now();
  currentAlarms.forEach((a) => {
    if (NON_BUILDING_EMOJIS.some((e) => a.name.includes(e))) return;
    if (a.customType === "training" || a.customType === "storage") return;
    if (!a.name.includes(`(${activeVillage})`) || !a.name.includes(serverTag))
      return;
    if (matchedIds.has(a.id || a.name)) return;
    if (a.scheduledTime - now > 10000) {
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name });
    }
  });
}
