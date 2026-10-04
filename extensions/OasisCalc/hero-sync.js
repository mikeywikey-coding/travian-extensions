/**
 * hero-sync.js — Hero attribute retrieval via JSON API
 */

// Minimum interval between auto-syncs (ms)
const _HERO_SYNC_INTERVAL = 10 * 60 * 1000;
let _lastHeroSync = 0;

// Load persisted sync timestamp so throttle survives page reloads
browser.storage.local.get(HERO_SYNC_KEY).then((data) => {
  if (data && data[HERO_SYNC_KEY]) _lastHeroSync = data[HERO_SYNC_KEY];
});

async function syncHeroStats(force) {
  // Skip if recently synced (unless forced by button click)
  if (!force && Date.now() - _lastHeroSync < _HERO_SYNC_INTERVAL) return;

  const syncBtn = document.getElementById("_vpsync-hero");
  if (syncBtn) {
    syncBtn.innerText = "\u{1F504} Syncing...";
    syncBtn.disabled = true;
  }

  try {
    await sleep(800 + Math.random() * 1500);
    const res = await fetch("/api/v1/hero/v2/screen/attributes", {
      credentials: "include",
      referrer: location.origin + "/hero",
      headers: {
        Accept: "application/json",
        "Accept-Language": navigator.language || "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const hero = data.hero;
    if (!hero) throw new Error("No hero data in API response");

    let dataFound = false;

    // Health (percentage 0–100)
    if (typeof hero.health === "number") {
      document.getElementById("_vpmax-hp").value = Math.max(
        1,
        Math.ceil(hero.health),
      );
      dataFound = true;
    }

    // Speed (fields/hour)
    if (typeof hero.speed === "number") {
      document.getElementById("_vpspeed").value = hero.speed;
      dataFound = true;
    }

    // Fighting strength (offense power)
    const attrs = hero.attributes;
    if (attrs && attrs.power && typeof attrs.power.value === "number") {
      document.getElementById("_vphero-off").value = attrs.power.value;
      dataFound = true;
    }

    // Damage reduction — sum LESS_DAMAGE across all equipped items
    const equipment = hero.equipment || {};
    let totalDmgRed = 0;
    for (const item of Object.values(equipment)) {
      if (!item || !item.attributes) continue;
      for (const attr of item.attributes) {
        if (attr.effectType === "LESS_DAMAGE") totalDmgRed += attr.value;
      }
    }
    document.getElementById("_vpdmg-red").value = totalDmgRed;

    // Mount status — an item in the horse slot makes the hero count as
    // cavalry against the animals' split defense values
    const mountedEl = document.getElementById("_vphero-mounted");
    if (mountedEl) {
      const horseSlot = Object.keys(equipment).find((k) =>
        k.toLowerCase().includes("horse"),
      );
      mountedEl.value = horseSlot && equipment[horseSlot] ? "1" : "0";
    }

    if (!dataFound) {
      throw new Error("Hero stats not found in API response.");
    }

    _lastHeroSync = Date.now();
    const obj = {};
    obj[HERO_SYNC_KEY] = _lastHeroSync;
    browser.storage.local.set(obj);

    saveSettings();
    renderResults();

    if (syncBtn) {
      syncBtn.innerText = "\u2705 Synced!";
      syncBtn.title = "Successfully synced";
      setTimeout(() => {
        syncBtn.innerText = "\u{1F504} Update";
        syncBtn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    if (syncBtn) {
      syncBtn.innerText = "\u274C Sync Failed";
      syncBtn.title = error.message;
      setTimeout(() => {
        syncBtn.innerText = "\u{1F504} Update";
        syncBtn.disabled = false;
      }, 3000);
    }
  }
}
