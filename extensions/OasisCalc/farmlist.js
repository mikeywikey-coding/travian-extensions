/**
 * farmlist.js — Shows each oasis's resource bonus on the rally point farm list.
 *
 * Reads the bonuses analyzeTiles() records while the map is browsed with the
 * finder loaded (ob_<host>); makes no requests of its own. An oasis the
 * finder hasn't seen yet gets a "?" badge until it is viewed on the map.
 */
(() => {
  if (!/\btt=99\b/.test(location.search)) return;

  const browser = globalThis.browser ?? chrome; // eslint-disable-line no-undef
  const BONUS_KEY = "ob_" + location.hostname;
  const DB_KEY = "db_" + location.hostname;
  const RES_NAMES = { 1: "Lumber", 2: "Clay", 3: "Iron", 4: "Crop" };
  const BIDI = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

  let bonuses = null; // { "x|y": "4:50" }
  let knownOases = new Set();
  let timer = 0;

  function parseNum(text) {
    const n = parseInt(String(text ?? "").replace(BIDI, "").replace(/[−–]/g, "-").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function readKey(cell) {
    const link = cell.querySelector('a[href*="karte.php"]');
    if (link) {
      const params = new URL(link.getAttribute("href"), location.origin).searchParams;
      const x = parseNum(params.get("x"));
      const y = parseNum(params.get("y"));
      if (x !== null && y !== null) return `${x}|${y}`;
    }
    const x = parseNum(cell.querySelector(".coordinateX")?.textContent);
    const y = parseNum(cell.querySelector(".coordinateY")?.textContent);
    return x !== null && y !== null ? `${x}|${y}` : null;
  }

  function renderBadge(bonus) {
    const badge = document.createElement("span");
    badge.className = "_vpfl-bonus";
    if (!bonus) {
      badge.classList.add("_vpfl-unknown");
      badge.textContent = "?";
      badge.title = "Oasis bonus not known yet — view this oasis on the map with Oasis Finder running.";
      return badge;
    }
    const names = [];
    const res = new Set();
    for (const part of bonus.split(",")) {
      const [r, pct] = part.split(":");
      const icon = document.createElement("i");
      icon.className = `r${r}`;
      const value = document.createElement("span");
      value.textContent = `${pct}%`;
      badge.append(icon, value);
      names.push(`+${pct}% ${RES_NAMES[r]}`);
      res.add(r);
    }
    // Clay or iron alone → green, clay/iron + crop → yellow, the rest grey.
    const clayIron = res.has("2") || res.has("3");
    badge.dataset.tier = clayIron ? (res.has("4") ? "mixed" : "best") : "plain";
    badge.title = `Oasis bonus: ${names.join(", ")}`;
    return badge;
  }

  // Idempotent: a row whose badge already matches is left untouched, so the
  // mutations this causes settle instead of re-triggering the observer.
  function decorate() {
    if (!bonuses) return;
    for (const row of document.querySelectorAll("table.slots tr.slot")) {
      const cell = row.querySelector("td.target");
      const key = cell && readKey(cell);
      if (!key) continue;
      const bonus = bonuses[key] || "";
      // Population 0 marks an oasis in any game language; villages never have 0.
      const isOasis = !!bonus || knownOases.has(key) ||
        parseNum(row.querySelector("td.population")?.textContent) === 0;
      const state = isOasis ? `${key}=${bonus}` : "";
      const existing = cell.querySelector("._vpfl-bonus");
      if ((existing?.dataset.state || "") === state) continue;
      existing?.remove();
      if (!isOasis) continue;
      const badge = renderBadge(bonus);
      badge.dataset.state = state;
      cell.appendChild(badge);
    }
    groupOases();
  }

  function targetName(cell) {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll(".coordinates, ._vpfl-bonus").forEach((el) => el.remove());
    return copy.textContent.replace(BIDI, "").trim();
  }

  function rowDistance(row) {
    const text = row.querySelector("td.distance")?.textContent?.replace(BIDI, "").trim();
    const value = Number.parseFloat(text?.replace(",", "."));
    return Number.isFinite(value) ? value : Infinity;
  }

  // Name sort leaves every "Unoccupied oasis" in one block in arbitrary order.
  // Within each run of same-named oases, group by bonus (lumber → clay → iron
  // → crop, unknown last), then by distance within each group.
  function groupOases() {
    for (const table of document.querySelectorAll("table.slots")) {
      // The game marks the active sort column with an arrow lacking .inactive.
      if (!table.querySelector("th.target .sortingArrow:not(.inactive)")) continue;
      const tbody = table.querySelector("tbody");
      if (!tbody) continue;
      let run = [];
      let runName = null;
      const flush = () => {
        if (run.length > 1) reorderRun(tbody, run);
        run = [];
        runName = null;
      };
      for (const row of tbody.querySelectorAll(":scope > tr.slot")) {
        const cell = row.querySelector("td.target");
        if (!cell?.querySelector("._vpfl-bonus")) { flush(); continue; }
        const name = targetName(cell);
        if (name !== runName) flush();
        runName = name;
        run.push({ row, bonus: bonuses[readKey(cell)] || "", distance: rowDistance(row) });
      }
      flush();
    }
  }

  function reorderRun(tbody, run) {
    const sorted = run
      .map((r, i) => ({ ...r, i }))
      .sort((a, b) => {
        if (!a.bonus !== !b.bonus) return a.bonus ? -1 : 1;
        if (a.bonus !== b.bonus) return a.bonus < b.bonus ? -1 : 1;
        return a.distance - b.distance || a.i - b.i;
      });
    if (sorted.every((r, i) => r.i === i)) return;
    const after = run[run.length - 1].row.nextSibling;
    for (const { row } of sorted) tbody.insertBefore(row, after);
  }

  function scheduleDecorate() {
    clearTimeout(timer);
    timer = setTimeout(decorate, 150);
  }

  function load() {
    browser.storage.local.get([BONUS_KEY, DB_KEY]).then((data) => {
      bonuses = data?.[BONUS_KEY] || {};
      knownOases = new Set(Array.isArray(data?.[DB_KEY]) ? data[DB_KEY] : []);
      decorate();
    });
  }

  load();
  // Pick up bonuses recorded in a map tab while this farm list is open.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes[BONUS_KEY] || changes[DB_KEY])) load();
  });
  // React re-renders rows on list refresh, expand and village switch.
  const root = document.querySelector(".buildRallyPointFarmList") || document.getElementById("content") || document.body;
  new MutationObserver(scheduleDecorate).observe(root, { childList: true, subtree: true });
})();
