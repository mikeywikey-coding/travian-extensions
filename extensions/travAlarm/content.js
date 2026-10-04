/**
 * TRAVIAN WATCHMAN PRO - ENTRY POINT
 * Version: 5.9 (Remote Fetch, Auto-Regen, Auto-Prod Fetch & Server Isolation)
 *
 * Load order (manifest.json):
 *   state.js → helpers.js → fetchers.js → scanners.js → ui.js → content.js
 */

// ==========================================
// MESSAGE LISTENER
// ==========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OPEN_CONTEXT_ADD") {
    let prefilled = generateSmartBuildingName();

    if (
      prefilled === CROP_OVERVIEW_LABEL ||
      window.location.pathname.includes("dorf1.php")
    ) {
      const cropAlarms = scanResources();

      if (cropAlarms && cropAlarms.length > 0) {
        api.runtime
          .sendMessage({
            type: "REFRESH_ALARMS",
            buildings: cropAlarms,
          })
          .then(() => syncState());
        return;
      }
    }

    prefilled = prefilled.replace(/,/g, "").replace(/\s+/g, " ").trim();
    setTimeout(() => {
      const name = prompt("Enter Alarm Name:", prefilled);
      if (!name) return;
      let text = msg.selectionText;
      let sourceNode = null;
      if (!text) {
        sourceNode = document.querySelector(
          ".window .timer, #content .timer, .buildDuration .timer",
        );
        if (sourceNode) text = sourceNode.innerText;
      }
      let d = calculateDelayFromSmartText(text, sourceNode);
      if (d === null) {
        const t = prompt(
          "Could not auto-detect time. Enter duration (e.g. 15, 1:30):",
        );
        if (t) d = parseSmartDuration(t);
      }
      if (d !== null && d > 0) {
        api.runtime
          .sendMessage({
            type: "REFRESH_ALARMS",
            buildings: [
              {
                name: `⭐ ${name} | ${getActiveVillageName()} ${serverTag}`,
                delay: d - 5000,
                customType: "manual",
              },
            ],
          })
          .then(() => syncState());
      }
    }, 50);
  }
});

// ==========================================
// STARTUP
// ==========================================
const jitterMs = (ms) => Math.round(ms * (0.7 + Math.random() * 0.8));

const TIMING_INTERVALS = {
  STATE_SYNC: 15000, // safety net; changes are pushed via storage.onChanged
  TRAINING_INITIAL: 3000,
  TRAINING_REPEAT: 300000, // 5 min
  WAREHOUSE_INITIAL: 5000,
  WAREHOUSE_REPEAT: 120000, // 2 min
  CELEBRATIONS_INITIAL: 7000,
  CELEBRATIONS_REPEAT: 600000, // 10 min
  STORAGE_REGEN: 90000, // 1.5 min
  ATTACK_CHECK_INITIAL: 10000,
  ATTACK_CHECK_REPEAT: 120000, // 2 min
  HERO_INITIAL: 3000,
  HERO_REPEAT: 60000,
};

const STORAGE_ALARM_ICONS = ["📦", "🌾"];

/** Detects newly-fired storage/resource alarms and triggers an immediate warehouse re-fetch. */
function checkFiredStorageAlarms() {
  const now = Date.now();
  let anyNewlyFired = false;

  currentAlarms.forEach((a) => {
    const isStorageAlarm =
      STORAGE_ALARM_ICONS.some((ic) => a.name.includes(ic)) ||
      a.customType === "storage";
    if (!isStorageAlarm) return;
    const uid = a.id || a.name;
    if (a.scheduledTime <= now && !_firedResourceAlarms.has(uid)) {
      _firedResourceAlarms.add(uid);
      anyNewlyFired = true;
    }
  });

  // Remove entries for alarms that no longer exist
  const activeUids = new Set(currentAlarms.map((a) => a.id || a.name));
  for (const uid of _firedResourceAlarms) {
    if (!activeUids.has(uid)) _firedResourceAlarms.delete(uid);
  }

  if (anyNewlyFired) {
    fetchState.warehouse.lastTime = 0; // Reset cooldown to allow immediate re-fetch
    fetchWarehouseData();
  }
}

/** Runs fn after a jittered initial delay, then on a jittered interval. */
function every(fn, initialMs, repeatMs) {
  setTimeout(fn, jitterMs(initialMs));
  setInterval(fn, jitterMs(repeatMs));
}

function startLoops(firstAlarms) {
  // Alarm state lives in the background, which persists every change to
  // storage — sync on those changes instead of polling. The slow interval is
  // only a safety net (e.g. a silenced alarm passing its finish time).
  let syncTimer = 0;
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || syncTimer) return;
    if (!changes._w4a && !changes._w4sc_snd && !changes._w4vol) return;
    syncTimer = setTimeout(() => {
      syncTimer = 0;
      syncState();
    }, 50);
  });
  syncState(firstAlarms);
  setInterval(syncState, jitterMs(TIMING_INTERVALS.STATE_SYNC));

  every(fetchTrainingData, TIMING_INTERVALS.TRAINING_INITIAL, TIMING_INTERVALS.TRAINING_REPEAT);
  every(fetchWarehouseData, TIMING_INTERVALS.WAREHOUSE_INITIAL, TIMING_INTERVALS.WAREHOUSE_REPEAT);
  every(fetchCelebrationsData, TIMING_INTERVALS.CELEBRATIONS_INITIAL, TIMING_INTERVALS.CELEBRATIONS_REPEAT);
  every(checkResourceVillageAttacks, TIMING_INTERVALS.ATTACK_CHECK_INITIAL, TIMING_INTERVALS.ATTACK_CHECK_REPEAT);
  every(fetchHeroData, TIMING_INTERVALS.HERO_INITIAL, TIMING_INTERVALS.HERO_REPEAT);
  // Auto-re-fetch warehouse when storage alarms expire (lightweight piggyback)
  setInterval(checkFiredStorageAlarms, jitterMs(TIMING_INTERVALS.STORAGE_REGEN));

  // Countdowns show whole seconds: tick just after each second boundary, skip
  // while the tab is hidden and catch up as soon as it is shown again.
  const loop = () => {
    if (!document.hidden) tick();
    setTimeout(loop, 1005 - (Date.now() % 1000));
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
  loop();

  // Re-scan the page after it changes, at most every 300ms. Mutations inside
  // our own widget/tooltip are ignored — scan() re-renders the widget, so
  // reacting to those would loop and thrash the section scroll position.
  let scanTimer = 0;
  new MutationObserver((mutations) => {
    if (scanTimer) return;
    const tooltip = document.getElementById("_tw-tt");
    const external = mutations.some(
      (m) => !timerWidget.contains(m.target) && !tooltip?.contains(m.target),
    );
    if (external) {
      scanTimer = setTimeout(() => {
        scanTimer = 0;
        scan();
      }, 300);
    }
  }).observe(document.body, { childList: true, subtree: true });

  scan();
}

const { timerWidget, listContainer, toggleBtn, audioBtn } = createWidget();
loadShortcuts();
// Request the alarms while the saved UI state loads, so the first render
// waits on one round trip instead of two.
const firstAlarms = api.runtime
  .sendMessage({ type: "GET_ACTIVE_ALARMS" })
  .catch(() => null);
Promise.all([restoreSectionState(), restoreVillageColors()]).then(() =>
  startLoops(firstAlarms),
);
