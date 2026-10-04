/**
 * TRAVIAN WATCHMAN PRO - BACKGROUND SCRIPT
 * Version: 6.0 (MV3 Service Worker — audio via Offscreen API)
 *
 * Audio playback is handled by offscreen.js via the Chrome Offscreen API.
 * The offscreen document receives SYNC_SOUND / STOP_SOUND / SET_VOLUME messages.
 */

/* global chrome */

importScripts("attack-state.js");

let alarms = [];
let dismissedAttacks = [];
let soundQueue = Promise.resolve();
const DEFAULT_SOUND_CATEGORIES = {
  attack: true,
  hero: true,
  building: true,
  farmlist: true,
  storage: true,
  training: true,
  culture: true,
  custom: true,
  daily: true,
  auto: true,
};
let soundCategories = { ...DEFAULT_SOUND_CATEGORIES };
let volume = 80;
let _stateLoaded = false;

const STORAGE_KEYS = {
  ALARMS: "_w4a",
  SOUND_CATEGORIES: "_w4sc_snd",
  DISMISSED_ATTACKS: "_w4ad",
  VOLUME: "_w4vol",
};
const ALARM_TICK = "_w4tick";

const DUPLICATE_THRESHOLD_MS = 5000; // two alarms with the same name within 5s = duplicate

// ==========================================
// CONTEXT MENU
// ==========================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "_tw-ctx",
    title: "Add to Alarm List",
    contexts: ["all"],
  });
  ensureTickAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureTickAlarm();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "_tw-ctx") {
    chrome.tabs
      .sendMessage(tab.id, {
        type: "OPEN_CONTEXT_ADD",
        selectionText: info.selectionText || "",
      })
      .catch(() => {});
  }
});

// ==========================================
// TICK ALARM (replaces setInterval for MV3)
// ==========================================

function ensureTickAlarm() {
  chrome.alarms.get(ALARM_TICK, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
    }
  });
}

// Precision tick: schedule a one-shot wake-up at the earliest upcoming alarm's
// scheduledTime so we don't wait up to 60s for the periodic tick.
const PRECISION_TICK = "_w4pt";
let _precisionTimeout = null;

function schedulePreciseTick() {
  const now = Date.now();
  let earliest = Infinity;
  for (const a of alarms) {
    if (!a.silenced && !a.notified && a.scheduledTime > now) {
      earliest = Math.min(earliest, a.scheduledTime);
    }
    if (a.customType === "attack" && a.impactAt > now) {
      earliest = Math.min(earliest, a.impactAt);
    }
  }
  clearTimeout(_precisionTimeout);
  _precisionTimeout = null;
  if (earliest === Infinity) {
    chrome.alarms.clear(PRECISION_TICK);
    return;
  }

  const delayMs = earliest - now;

  // Best-effort foreground precision. Only chrome.alarms is durable across
  // worker suspension; timers do not keep a service worker alive.
  if (delayMs < 62000) {
    _precisionTimeout = setTimeout(
      () => {
        _precisionTimeout = null;
        runAlarmTick();
      },
      Math.max(delayMs, 100),
    ); // At least 100ms to avoid tight loops
  }

  // Also schedule a chrome.alarms one-shot as a durable fallback.
  // chrome.alarms persists across SW restarts. The min delay may be
  // clamped to ~30s, but it still reduces worst-case from 60s to ~30s.
  chrome.alarms.create(PRECISION_TICK, { when: earliest });
}

// ==========================================
// AUDIO DELEGATION (via Offscreen API)
// ==========================================

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function ensureOffscreen() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play alarm sounds for expired timers",
    });
  } catch {
    // Already exists — fine
  }
}

function classifyAlarmCategory(a) {
  const n = a.name || "";
  if (a.customType === "attack" || n.includes("🚨") || n.includes("⚠️"))
    return "attack";
  if (n.includes("⚔️")) return "hero";
  if (n.includes("🎓")) return "training";
  if (n.includes("🎉")) return "culture";
  if (a.customType === "storage" || n.includes("📦")) return "storage";
  if (a.customType === "farmlist") return "farmlist";
  if (a.customType === "daily") return "daily";
  if (n.startsWith("⭐")) return a.customType === "manual" ? "custom" : "auto";
  return "building";
}

function syncAlarmSound(attackEvents, normal) {
  const message = {
    type: "SYNC_SOUND", normal, volume, attackEvents,
    activeAttackIds: soundCategories.attack === false ? [] : alarms
      .filter(a => a.customType === "attack" && !a.silenced && !a.noSound && a.impactAt > Date.now())
      .map(a => a.id),
  };
  // Persist consumed events BEFORE playback; serialize updates so a slow
  // offscreen creation cannot let PLAY overtake a subsequent dismissal.
  const saved = saveState();
  soundQueue = soundQueue.catch(() => {}).then(async () => {
    await saved;
    // Don't create a fresh audio document for an idle tick. Still update an
    // existing one so dismissal, expiry and muting stop playback immediately.
    if (normal || attackEvents.length) await ensureOffscreen();
    // State may have changed while the document was opening. Never deliver a
    // queued cue for an attack that has since been dismissed, muted or landed.
    const eligible = new Set(soundCategories.attack === false ? [] : alarms
      .filter(a => a.customType === "attack" && !a.silenced && !a.noSound && a.impactAt > Date.now())
      .map(a => a.id));
    message.activeAttackIds = message.activeAttackIds.filter(id => eligible.has(id));
    message.attackEvents = message.attackEvents.filter(event => eligible.has(event.id));
    message.normal &&= alarms.some(a => a.customType !== "attack" && !a.silenced &&
      !a.noSound && a.scheduledTime <= Date.now() && soundCategories[classifyAlarmCategory(a)] !== false);
    message.volume = volume;
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (normal || attackEvents.length) throw error;
    }
  }).catch(error => console.warn("TravAlarm audio update failed", error));
}

function stopAlarmSound() {
  syncAlarmSound([], false);
  soundQueue = soundQueue.then(() => chrome.runtime.sendMessage({ type: "STOP_SOUND" }))
    .catch(error => console.warn("TravAlarm audio stop failed", error));
}

// ==========================================
// STATE
// ==========================================

// Resolves once storage has been loaded into memory.
// GET_ACTIVE_ALARMS waits on this so a freshly-woken service worker never
// returns an empty alarm list before storage has been restored.
let _stateReadyResolve;
const stateReady = new Promise((resolve) => {
  _stateReadyResolve = resolve;
});

// Load State — runAlarmTick() deferred until storage is restored
chrome.storage.local
  .get([
    STORAGE_KEYS.ALARMS,
    STORAGE_KEYS.SOUND_CATEGORIES,
    STORAGE_KEYS.DISMISSED_ATTACKS,
    STORAGE_KEYS.VOLUME,
  ])
  .then((res) => {
    const savedAlarms = (res[STORAGE_KEYS.ALARMS] || []).map((a) => ({
      ...a,
      id: a.id || generateId(),
      isPinned: a.isPinned || false,
    }));

    // Merge
    const combined = [...savedAlarms, ...alarms];
    const uniqueMap = new Map();
    combined.forEach((item) => {
      const key = item.id || item.name;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    alarms = Array.from(uniqueMap.values()).map(a =>
      a.customType === "attack" ? AttackState.normalize(a, Date.now()) : a);
    // Collapse legacy duplicates without replaying an already consumed phase.
    alarms = alarms.reduce((list, a) => {
      const old = a.customType === "attack" && list.find(x =>
        x.customType === "attack" && AttackState.same(x, a));
      if (old) {
        old.notified ||= a.notified;
        old.silenced ||= a.silenced;
      } else list.push(a);
      return list;
    }, []);
    if (res[STORAGE_KEYS.SOUND_CATEGORIES]) {
      soundCategories = {
        ...DEFAULT_SOUND_CATEGORIES,
        ...res[STORAGE_KEYS.SOUND_CATEGORIES],
      };
    }
    if (res[STORAGE_KEYS.VOLUME] != null) volume = res[STORAGE_KEYS.VOLUME];

    dismissedAttacks = AttackState.prune(
      res[STORAGE_KEYS.DISMISSED_ATTACKS] || [], Date.now());

    // Signal that state is ready — deferred GET_ACTIVE_ALARMS can now respond
    _stateLoaded = true;
    _stateReadyResolve();

    // Now safe to run the tick — alarms array is populated from storage
    runAlarmTick();
  });

function saveState() {
  // Guard: don't overwrite persisted data before storage has loaded into memory.
  // A cold SW wake receives messages before the storage .then() resolves —
  // calling saveState() then would persist empty defaults, wiping all alarms.
  if (!_stateLoaded) return;
  return chrome.storage.local.set({
    [STORAGE_KEYS.ALARMS]: alarms,
    [STORAGE_KEYS.SOUND_CATEGORIES]: soundCategories,
    [STORAGE_KEYS.DISMISSED_ATTACKS]: dismissedAttacks,
    [STORAGE_KEYS.VOLUME]: volume,
  });
}

// ==========================================
// ALARM TICK LOGIC
// ==========================================

function runAlarmTick() {
  if (!_stateLoaded) return;
  const now = Date.now();
  const attackEvents = [];
  let normal = false;
  dismissedAttacks = AttackState.prune(dismissedAttacks, now);
  alarms = alarms.filter(a => {
    if (a.customType !== "attack" || a.impactAt > now) return true;
    AttackState.dismiss(dismissedAttacks, a);
    return false;
  });
  for (const a of alarms) {
    if (a.silenced || a.scheduledTime > now) continue;
    const audible = !a.noSound && soundCategories[classifyAlarmCategory(a)] !== false;
    if (a.customType === "attack") {
      if (!a.notified && audible) {
        attackEvents.push({ id: a.id, expiresAt: a.impactAt, phase: a.attackPhase });
      }
    } else if (audible) normal = true;
    // A consumed attack is never replayed by a tick, refresh or recheck.
    a.notified = true;
  }
  syncAlarmSound(attackEvents, normal);
  schedulePreciseTick();
}

// Run tick on every chrome.alarms fire — wait for storage to load first
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_TICK || alarm.name === PRECISION_TICK) {
    stateReady.then(() => runAlarmTick());
  }
});

// Ensure tick alarm exists on wake (runAlarmTick is called after storage loads above)
ensureTickAlarm();

// ==========================================
// HELPERS
// ==========================================

/**
 * Removes stale alarms of a given type that are no longer in the active set.
 * @param {string} type - customType to filter (e.g. "resource", "storage", "culture")
 * @param {string[]} activeNames - names still valid on the page
 * @param {string} serverTag - server identifier to scope the cleanup
 * @param {boolean} [keepExpired=false] - if true, keep alarms that have already fired
 * @param {boolean} [ignoreSilenced=false] - if true, silenced alarms are still removed when not in activeNames
 */
function filterStaleAlarms(
  type,
  activeNames,
  serverTag,
  keepExpired = false,
  ignoreSilenced = false,
) {
  const activeSet = new Set(activeNames || []);
  alarms = alarms.filter((a) => {
    if (a.customType !== type) return true;
    if (!a.name.includes(serverTag)) return true;
    if (keepExpired && a.scheduledTime <= Date.now()) return true;
    if (!ignoreSilenced && a.silenced) return true;
    return activeSet.has(a.name);
  });
}

// ==========================================
// MESSAGE LISTENER
// ==========================================
function handleMessage(msg, sender, sendResponse) {
  switch (msg.type) {
    case "REFRESH_ALARMS":
      // The outer listener gates ALL messages on storage load, in arrival order.
      msg.buildings.forEach((newB) => {
        const delay = parseInt(newB.delay, 10);
        if (isNaN(delay) || delay < 0) return;

        const now = Date.now();
        const newScheduledTime = now + delay;

        if (newB.customType === "attack") {
          AttackState.upsert(alarms, dismissedAttacks, newB, now, generateId);
          return;
        }

        // For refreshable types, update an existing alarm in-place rather than creating a duplicate.
        // resource/storage: skip update if silenced and already past due (user dismissed it).
        // culture: update time but keep silenced state (no auto-un-silence on cultural alarms).
        const refreshTypes = [
          "training",
          "settler",
          "resource",
          "storage",
          "culture",
          "farmlist",
          "daily",
          "hero",
        ];
        if (refreshTypes.includes(newB.customType)) {
          let existing;
          if (newB.customType === "hero") {
            // Hero has one state at a time per server — match by customType + serverTag
            // so status transitions (e.g. "Going to Oasis" → "Returning") reuse the
            // same alarm record instead of accumulating stale expired duplicates.
            const newServerTag = newB.name.split(" ").pop();
            existing = alarms.find(
              (a) => a.customType === "hero" && a.name.endsWith(newServerTag),
            );
          } else {
            existing = alarms.find((a) => a.name === newB.name);
          }
          if (existing) {
            if (newB.customType === "farmlist" || newB.customType === "daily") {
              existing.scheduledTime = newScheduledTime;
              existing.notified = false;
              existing.silenced = false;
              return;
            }

            if (newB.customType === "hero") {
              existing.name = newB.name;
              existing.noSound = newB.noSound || false;
            }
            existing.scheduledTime = newScheduledTime;
            existing.notified = false;
            if (newB.customType !== "culture") existing.silenced = false;
            return;
          }
        }

        const isDuplicate = alarms.some(
          (a) =>
            a.name === newB.name &&
            Math.abs(a.scheduledTime - newScheduledTime) <
              DUPLICATE_THRESHOLD_MS,
        );
        if (!isDuplicate) {
          const isHero = newB.name.includes("⚔️");
          if (isHero) {
            const serverTag = newB.name.split(" ").pop();
            const idx = alarms.findIndex(
              (a) =>
                a.name.includes("⚔️") &&
                a.name.endsWith(serverTag) &&
                a.scheduledTime <= now,
            );
            if (idx !== -1) alarms.splice(idx, 1);
          } else if (newB.customType == null) {
            const buildingTagMatch = newB.name.match(
              /\((.+)\)\s*(\[[^\]]+\])$/,
            );
            if (buildingTagMatch) {
              const villagePart = buildingTagMatch[1];
              const serverTagPart = buildingTagMatch[2];
              // Strip the `#N` disambiguator the scanner appends to buildings
              // queued at the same time, leaving the base
              // "<name> lvl <n> (village) [tag]" identity. Alarms that share
              // this identity are distinct completions of the same upgrade on
              // different fields (e.g. leveling crops one-by-one) — keep them
              // until the user clears them, instead of letting a new same-named
              // build evict the earlier one.
              const baseId = (n) => n.replace(/ #\d+$/, "");
              const newBaseId = baseId(newB.name);
              for (let i = alarms.length - 1; i >= 0; i--) {
                const a = alarms[i];
                if (
                  a.customType == null &&
                  !a.name.includes("⚔️") &&
                  !a.isPinned &&
                  baseId(a.name) !== newBaseId &&
                  a.name.includes(`(${villagePart})`) &&
                  a.name.includes(serverTagPart) &&
                  (a.scheduledTime <= now || a.silenced === true)
                ) {
                  alarms.splice(i, 1);
                }
              }
            }
          }
          alarms.push({
            id: generateId(),
            name: newB.name,
            scheduledTime: newScheduledTime,
            createdAt: now,
            notified: false,
            silenced: false,
            recurring: newB.recurring || 0,
            customType: newB.customType || null,
            isPinned: false,
            noSound: newB.noSound || false,
          });
        }
      });
      // Run a tick immediately after new alarms are added
      runAlarmTick();
      sendResponse({ ok: true });
      return true;

    case "GET_ACTIVE_ALARMS":
      sendResponse({ alarms, soundCategories, volume });
      return true;

    case "STOP_SOUND_ONLY":
      stopAlarmSound();
      break;

    case "DELETE_ALARM": {
      const target = alarms.find((a) => a.id === msg.id || a.name === msg.name);

      // Older tabs send this when their stale sidebar has no attack marker.
      // Only the impact deadline or an explicit dismissal may expire a card.
      if (target?.customType === "attack" && msg.autoClear) break;

      if (target && target.customType === "attack") {
        AttackState.dismiss(dismissedAttacks, target);
      }

      if (msg.id) alarms = alarms.filter((a) => a.id !== msg.id);
      else if (msg.name) alarms = alarms.filter((a) => a.name !== msg.name);

      runAlarmTick();
      break;
    }

    case "ATTACK_CLEARED":
      // A sidebar clear must not erase dismissal history for stale tabs.
      break;

    case "EDIT_ALARM": {
      const alarmToEdit = alarms.find((a) => a.id === msg.id);
      if (alarmToEdit && alarmToEdit.customType !== "attack") {
        if (msg.newName) alarmToEdit.name = msg.newName;
        if (msg.newDelay) {
          alarmToEdit.scheduledTime = Date.now() + msg.newDelay;
          alarmToEdit.createdAt = Date.now();
          alarmToEdit.notified = false;
          alarmToEdit.silenced = false;
        }
        runAlarmTick();
      }
      break;
    }

    case "TOGGLE_PIN": {
      const pinTarget = alarms.find((a) => a.id === msg.id);
      if (pinTarget) {
        pinTarget.isPinned = !pinTarget.isPinned;
        saveState();
      }
      break;
    }

    case "CLEAR_STALE_TRAINING": {
      // Can't use filterStaleAlarms() here — training alarms support a legacy
      // name format (without the 🎓 prefix) that requires fuzzy matching below.
      const activeSet = new Set(msg.activeNames || []);
      alarms = alarms.filter((a) => {
        if (a.customType !== "training") return true;
        if (!a.name.includes(msg.serverTag)) return true;
        // Keep alarms that already fired — let user dismiss them manually
        if (a.scheduledTime <= Date.now()) return true;
        // Match both new (🎓) and old (no emoji) name formats
        if (activeSet.has(a.name)) return true;
        const legacyName = a.name.replace("🎓 ", "");
        if (activeSet.has("🎓 " + a.name) || activeSet.has(legacyName))
          return true;
        return false;
      });
      runAlarmTick();
      break;
    }

    case "CLEAR_STALE_RESOURCES":
      filterStaleAlarms("resource", msg.activeNames, msg.serverTag);
      runAlarmTick();
      break;

    case "CLEAR_STALE_STORAGE":
      filterStaleAlarms("storage", msg.activeNames, msg.serverTag, false, true);
      runAlarmTick();
      break;

    case "CLEAR_STALE_CELEBRATIONS":
      // keepExpired=true: alarms that already fired stay until user dismisses them
      filterStaleAlarms("culture", msg.activeNames, msg.serverTag, true);
      runAlarmTick();
      break;

    case "CLEAR_STALE_HERO":
      // Hero has one state per server — collapse any accumulated duplicates.
      // Drop expired hero alarms not in activeNames so stale "Going to Oasis"
      // or "Returning" entries from prior trips don't persist across cycles.
      filterStaleAlarms("hero", msg.activeNames, msg.serverTag, false);
      runAlarmTick();
      break;

    case "SILENCE_ALARM": {
      const silenceTarget = alarms.find((a) => a.id === msg.id);
      if (silenceTarget) {
        silenceTarget.silenced = true;
        runAlarmTick();
      }
      break;
    }

    case "SOUND_RECHECK":
      // Offscreen document finished playing a sound and cooldown expired —
      // re-evaluate alarms to see if sound should repeat.
      runAlarmTick();
      break;

    case "SET_SOUND_CATEGORY":
      if (
        msg.category &&
        Object.prototype.hasOwnProperty.call(DEFAULT_SOUND_CATEGORIES, msg.category)
      ) {
        soundCategories[msg.category] = !!msg.enabled;
        runAlarmTick();
      }
      sendResponse({ soundCategories });
      return true;

    case "SET_VOLUME":
      // Only process SET_VOLUME from content scripts (sender.tab exists).
      // The background itself forwards SET_VOLUME via chrome.runtime.sendMessage,
      // which is also received by the background's own onMessage listener —
      // without this guard, it creates an infinite recursion loop.
      if (!sender.tab) break;
      volume = msg.volume;
      saveState();
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage({ type: "SET_VOLUME", volume });
      });
      break;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Offscreen audio messages are handled only by the offscreen document.
  if (["SYNC_SOUND", "PLAY_SOUND", "STOP_SOUND"].includes(msg.type)) return false;
  if (msg.type === "SET_VOLUME" && !sender.tab) return false;
  stateReady.then(() => {
    const pending = handleMessage(msg, sender, sendResponse);
    if (pending !== true) sendResponse({ ok: true });
  }).catch(error => sendResponse({ ok: false, error: String(error) }));
  return true;
});
