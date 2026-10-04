/**
 * TRAVIAN WATCHMAN PRO - UI & WIDGET
 * Grouped Dashboard with Ring Gauges
 */

// ==========================================
// TIME FORMATTING
// ==========================================

/**
 * Formats a total seconds value as M:SS or H:MM:SS.
 * @param {number} totalSeconds - non-negative integer
 * @returns {string}
 */
function formatHMS(totalSeconds) {
  const h = (totalSeconds / 3600) | 0;
  const m = ((totalSeconds % 3600) / 60) | 0;
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

// ==========================================
// ALARM CLASSIFICATION
// ==========================================

const SECTION_META = {
  attack: {
    label: "Attacks",
    color: "var(--tw-c-red)",
    cls: "tw-type-red",
    order: 0,
  },
  hero: {
    label: "Hero",
    color: "var(--tw-c-gold)",
    cls: "tw-type-gold",
    order: 1,
  },
  building: {
    label: "Buildings",
    color: "var(--tw-c-orange)",
    cls: "tw-type-orange",
    order: 2,
  },
  farmlist: {
    label: "Farm List",
    color: "var(--tw-c-purple)",
    cls: "tw-type-purple",
    order: 3,
  },
  storage: {
    label: "Storage",
    color: "var(--tw-c-amber)",
    cls: "tw-type-amber",
    order: 4,
  },
  training: {
    label: "Training",
    color: "var(--tw-c-blue)",
    cls: "tw-type-blue",
    order: 5,
  },
  culture: {
    label: "Parties",
    color: "var(--tw-c-emerald)",
    cls: "tw-type-emerald",
    order: 6,
  },
  custom: {
    label: "Custom",
    color: "var(--tw-c-pink)",
    cls: "tw-type-pink",
    order: 7,
  },
  daily: {
    label: "Daily",
    color: "var(--tw-c-lime)",
    cls: "tw-type-lime",
    order: 8,
  },
  auto: {
    label: "Preset",
    color: "var(--tw-c-purple)",
    cls: "tw-type-purple",
    order: 9,
  },
};

function classifyAlarm(a) {
  const n = a.name;
  if (n.includes("🚨") || n.includes("⚠️")) return "attack";
  if (n.includes("⚔️")) return "hero";
  if (n.includes("🎓")) return "training";
  if (n.includes("🎉")) return "culture";
  if (a.customType === "storage" || n.includes("📦")) return "storage";
  if (n.includes("🌾")) return "grain";
  if (n.includes("🪵") || n.includes("🧱") || n.includes("🔩"))
    return "resource";
  if (a.customType === "farmlist") return "farmlist";
  if (a.customType === "daily") return "daily";
  if (n.startsWith("⭐")) return a.customType === "manual" ? "custom" : "auto";
  return "building";
}

function getTypeColorClass(a) {
  const type = classifyAlarm(a);
  return SECTION_META[type]?.cls || "tw-type-orange";
}

/**
 * Sorts section type keys by display order, swapping custom/auto
 * so the one with the soonest alarm renders first.
 * @param {string[]} types - Array of section type keys
 * @param {Object} groups - Map of type → alarm[]
 * @returns {string[]}
 */
function sortSectionTypes(types, groups) {
  // "custom" (user-created ⭐) and "auto" (preset ⭐) share the same order slot.
  // Whichever has the soonest alarm wins and renders first so the urgent one is visible.
  const customSoonest = groups.custom
    ? Math.min(...groups.custom.map((a) => a.scheduledTime))
    : Infinity;
  const autoSoonest = groups.auto
    ? Math.min(...groups.auto.map((a) => a.scheduledTime))
    : Infinity;
  const customFirst = customSoonest <= autoSoonest;

  return [...types].sort((a, b) => {
    const orderOf = (t) => {
      if (t === "custom") return customFirst ? 7 : 8;
      if (t === "auto") return customFirst ? 8 : 7;
      return SECTION_META[t]?.order ?? 99;
    };
    return orderOf(a) - orderOf(b);
  });
}

function markLastExpandedSection(container) {
  if (!container) return;
  const sections = container.querySelectorAll(".tw-section");
  let last = null;
  sections.forEach((s) => {
    s.classList.remove("is-last-expanded");
    if (!s.classList.contains("is-collapsed")) last = s;
  });
  if (last) last.classList.add("is-last-expanded");
  updateSectionHeights(container);
}

function updateSectionHeights(container) {
  const widget = document.getElementById("_tw-w");
  if (!widget) return;
  const sections = container.querySelectorAll(".tw-section");
  const expanded = [];

  // Measure chrome (titlebar + ring strip + toolbar)
  let chromeH = 0;
  for (const sel of [".tw-titlebar", ".tw-ring-strip", ".tw-toolbar"]) {
    const el = widget.querySelector(sel);
    if (el) chromeH += el.getBoundingClientRect().height;
  }

  // NOTE: do NOT clear `body.style.maxHeight` here before measuring. Clearing
  // it would let the body grow to fit all content → overflow disappears →
  // the browser forces scrollTop=0 → re-applying maxHeight on the next line
  // leaves the section permanently scrolled to top every 200ms (rebuildUI tick).
  // Individual card heights via getBoundingClientRect() are independent of the
  // parent's maxHeight, so we don't need to clear it to measure them.

  // Measure each section
  let headersH = 0;
  sections.forEach((s) => {
    const header = s.querySelector(".tw-section-header");
    const body = s.querySelector(".tw-section-body");
    if (header) headersH += header.getBoundingClientRect().height;
    if (!body) return;
    if (!s.classList.contains("is-collapsed")) {
      const cards = body.querySelectorAll(".tw-alarm");
      const cardCount = cards.length || 1;
      const cardH =
        cards.length > 0 ? cards[0].getBoundingClientRect().height : 50;
      expanded.push({ body, cardCount, cardH });
    }
  });

  if (expanded.length === 0) return;

  const maxH = parseInt(getComputedStyle(widget).maxHeight) || 670;
  const available = maxH - chromeH - headersH;
  const totalNatural = expanded.reduce(
    (sum, s) => sum + s.cardCount * s.cardH,
    0,
  );

  if (totalNatural <= available) {
    expanded.forEach((s) => (s.body.style.maxHeight = ""));
  } else {
    // Pass 1: guarantee every section 1 card
    const slots = expanded.map((s) => ({ ...s, shown: 1 }));
    let remaining = available - slots.reduce((sum, s) => sum + s.cardH, 0);

    // Pass 2: round-robin one card at a time so every section grows evenly
    let changed = true;
    while (changed && remaining > 0) {
      changed = false;
      for (const s of slots) {
        if (s.shown < s.cardCount && remaining >= s.cardH) {
          s.shown += 1;
          remaining -= s.cardH;
          changed = true;
        }
      }
    }

    slots.forEach((s) => {
      s.body.style.maxHeight = s.shown * s.cardH + "px";
    });
  }
}

// ==========================================
// SECTION COLLAPSE PERSISTENCE
// ==========================================
function saveSectionState() {
  api.storage.local.set({
    _tw_sections: {
      collapsed: [...collapsedSections],
      expanded: [...expandedSections],
    },
  });
}

async function restoreSectionState() {
  const res = await api.storage.local.get({ _tw_sections: null });
  if (res._tw_sections) {
    (res._tw_sections.collapsed || []).forEach((t) => collapsedSections.add(t));
    (res._tw_sections.expanded || []).forEach((t) => expandedSections.add(t));
  }
}

// Sync collapse state across tabs via storage.onChanged
api.storage.onChanged.addListener((changes) => {
  if (!changes._tw_sections) return;
  const newVal = changes._tw_sections.newValue;
  if (!newVal) return;

  collapsedSections.clear();
  expandedSections.clear();
  (newVal.collapsed || []).forEach((t) => collapsedSections.add(t));
  (newVal.expanded || []).forEach((t) => expandedSections.add(t));

  // Apply to existing section DOM elements
  const listContainer = document.getElementById("tw-alarm-list");
  document.querySelectorAll(".tw-section").forEach((section) => {
    const type = section.dataset.type;
    if (collapsedSections.has(type)) {
      section.classList.add("is-collapsed");
    } else {
      section.classList.remove("is-collapsed");
    }
  });
  markLastExpandedSection(listContainer);
});

// ==========================================
// SYNC STATE & UI REFRESH
// ==========================================

/** @param {Promise} [prefetched] an already-sent GET_ACTIVE_ALARMS request */
async function syncState(prefetched) {
  const res = await (prefetched instanceof Promise
    ? prefetched
    : api.runtime.sendMessage({ type: "GET_ACTIVE_ALARMS" }));
  if (!res) return;

  const now = Date.now();
  currentAlarms = res.alarms || [];

  // Populate firstSeenTimes from persistent createdAt (survives refresh)
  currentAlarms.forEach((a) => {
    const uid = a.id || a.name;
    if (!firstSeenTimes.has(uid)) firstSeenTimes.set(uid, a.createdAt || now);
  });
  // Clean up stale entries
  const activeUids = new Set(currentAlarms.map((a) => a.id || a.name));
  for (const uid of firstSeenTimes.keys()) {
    if (!activeUids.has(uid)) firstSeenTimes.delete(uid);
  }

  // Update audio button & volume slider state
  updateAudioState(res.soundCategories || {});
  const volSlider = document.getElementById("_tw-vol");
  const volVal = document.getElementById("_tw-vol-val");
  if (volSlider && res.volume != null && !volSlider.dataset.dragging) {
    volSlider.value = res.volume;
    volVal.textContent = res.volume + "%";
  }

  renderAlarms();
}

/** Sorts currentAlarms (pinned first, then done, then time) and redraws. */
function renderAlarms() {
  const now = Date.now();
  currentAlarms.sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    const aDone = a.scheduledTime - now <= 0;
    const bDone = b.scheduledTime - now <= 0;
    if (aDone !== bDone) return aDone ? -1 : 1;

    if (aDone && bDone) {
      const getTag = (s) => {
        const m = s.match(/\[([^\]]+)\]\s*$/);
        return m ? m[1] : "zzz";
      };
      const tagA = getTag(a.name);
      const tagB = getTag(b.name);
      if (tagA !== tagB) return tagA.localeCompare(tagB);

      const getVillage = (s) => {
        let clean = s.replace(/\[[^\]]+\]/g, "").trim();
        const pMatch = clean.match(/\(([^)]+)\)/);
        if (pMatch) return pMatch[1].trim();
        if (clean.includes("|")) return clean.split("|")[1].trim();
        return "ZZ_Global";
      };
      const villA = getVillage(a.name);
      const villB = getVillage(b.name);
      if (villA !== villB) return villA.localeCompare(villB);
      return a.name.localeCompare(b.name);
    }
    if (a.scheduledTime !== b.scheduledTime)
      return a.scheduledTime - b.scheduledTime;
    return a.name.localeCompare(b.name);
  });

  rebuildUI();
  // Fill in countdowns now rather than at the next second tick, so new cards
  // never show their --:-- placeholder.
  _doneCount = currentAlarms.reduce((n, a) => n + (a.scheduledTime <= now), 0);
  tick();
}

const SOUND_CATEGORY_ORDER = [
  "attack",
  "hero",
  "building",
  "farmlist",
  "storage",
  "training",
  "culture",
  "custom",
  "daily",
  "auto",
];

let currentSoundCategories = null;

function renderSoundCategoryToggles(root) {
  const host = root.querySelector("#_tw-cat-toggles");
  if (!host) return;
  host.innerHTML = SOUND_CATEGORY_ORDER.map((key) => {
    const meta = SECTION_META[key] || { label: key };
    return `
      <div class="audio-option audio-cat-row" data-cat="${key}">
        <span class="audio-cat-label">${meta.label}</span>
        <span class="tw-toggle is-on" role="switch" aria-checked="true">
          <span class="tw-toggle-track"></span>
          <span class="tw-toggle-thumb"></span>
        </span>
      </div>
    `;
  }).join("");

  host.querySelectorAll(".audio-cat-row").forEach((row) => {
    row.onclick = (e) => {
      e.stopPropagation();
      const cat = row.dataset.cat;
      const next = currentSoundCategories
        ? currentSoundCategories[cat] === false
        : false;
      if (currentSoundCategories) currentSoundCategories[cat] = next;
      applyToggleVisual(row, next);
      updateAudioButtonIcon();
      api.runtime
        .sendMessage({ type: "SET_SOUND_CATEGORY", category: cat, enabled: next })
        .catch(() => {});
    };
  });
}

function applyToggleVisual(row, enabled) {
  const toggle = row.querySelector(".tw-toggle");
  if (toggle) {
    toggle.classList.toggle("is-on", enabled);
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
  }
  row.classList.toggle("is-off", !enabled);
}

function updateAudioButtonIcon() {
  const btn = document.getElementById("_tw-ab");
  if (!btn) return;
  const anyOn = currentSoundCategories
    ? SOUND_CATEGORY_ORDER.some((k) => currentSoundCategories[k] !== false)
    : true;
  btn.innerHTML = makeUiIcon(anyOn ? "speaker" : "speakerOff");
}

function updateAudioState(cats) {
  currentSoundCategories = { ...(cats || {}) };
  const rows = document.querySelectorAll(".audio-cat-row");
  rows.forEach((row) => {
    const cat = row.dataset.cat;
    applyToggleVisual(row, currentSoundCategories[cat] !== false);
  });
  updateAudioButtonIcon();
}

// ==========================================
// REBUILD UI (grouped sections)
// ==========================================
function rebuildUI() {
  const now = Date.now();

  // Update alarm count badge
  const countEl = document.getElementById("_tw-cnt");
  if (countEl) {
    const newCount = String(currentAlarms.length);
    if (countEl.textContent !== newCount) {
      countEl.textContent = newCount;
      countEl.classList.remove("is-updated");
      void countEl.offsetWidth;
      countEl.classList.add("is-updated");
    }
  }

  if (currentAlarms.length === 0) {
    if (!listContainer.querySelector(".tw-empty")) {
      listContainer.innerHTML = `<div class="tw-empty">${makeUiIcon("shield")}<span>No Active Timers</span></div>`;
    }
    updateRingStrip({});
    return;
  }

  // Remove empty state if present
  const emptyEl = listContainer.querySelector(".tw-empty");
  if (emptyEl) emptyEl.remove();

  // Group alarms by type
  const groups = {};
  currentAlarms.forEach((a) => {
    const type = classifyAlarm(a);
    if (!groups[type]) groups[type] = [];
    groups[type].push(a);
  });

  // Sort section types — swap custom/auto so the one with the soonest alarm comes first
  const sortedTypes = sortSectionTypes(Object.keys(groups), groups);

  // Track existing section elements
  const existingSections = new Map();
  listContainer
    .querySelectorAll(".tw-section")
    .forEach((el) => existingSections.set(el.dataset.type, el));

  // Find type with soonest alarm for auto-expand
  let soonestType = null;
  let soonestTime = Infinity;
  for (const [type, alarms] of Object.entries(groups)) {
    const minTime = Math.min(...alarms.map((a) => a.scheduledTime));
    if (minTime < soonestTime) {
      soonestTime = minTime;
      soonestType = type;
    }
  }

  sortedTypes.forEach((type, idx) => {
    const alarms = groups[type];
    const meta = SECTION_META[type] || SECTION_META.building;
    let section = existingSections.get(type);

    if (!section) {
      section = createSectionNode(type, meta);
      // Auto-collapse non-soonest sections, but only if user hasn't explicitly expanded them
      if (
        !expandedSections.has(type) &&
        !collapsedSections.has(type) &&
        type !== soonestType &&
        sortedTypes.length > 1
      ) {
        section.classList.add("is-collapsed");
      }
    }

    // Update section header info
    const countSpan = section.querySelector(".tw-section-count");
    if (countSpan) countSpan.textContent = alarms.length;

    // Find the alarm to show in the collapsed header: prefer a done alarm over a future one
    const doneAlarms = alarms.filter((a) => a.scheduledTime < now);
    let soonestAlarm =
      doneAlarms.length > 0
        ? doneAlarms.reduce((a, b) =>
            a.scheduledTime < b.scheduledTime ? a : b,
          )
        : alarms.reduce((a, b) => (a.scheduledTime < b.scheduledTime ? a : b));

    // Show village name of next-to-finish alarm in the header (not for daily — it's global)
    const villageSpan = section.querySelector(".tw-section-next-village");
    if (villageSpan) {
      const structured = getStructuredName(soonestAlarm.name, false);
      setVillageLabel(
        villageSpan,
        type === "daily" ? "" : structured.village || "",
      );
    }

    // Done badge: show count of done alarms in collapsed header
    const doneCount = alarms.filter((a) => a.scheduledTime <= now).length;
    const doneBadge = section.querySelector(".tw-section-done-badge");
    if (doneBadge) {
      if (doneCount > 0) {
        doneBadge.textContent = "DONE";
        doneBadge.style.display = "";
      } else {
        doneBadge.textContent = "";
        doneBadge.style.display = "none";
      }
    }

    // Flash the section header when ALL alarms in this category are done
    const sectionHeader = section.querySelector(".tw-section-header");
    if (sectionHeader) {
      sectionHeader.classList.toggle(
        "is-all-done",
        doneCount === alarms.length,
      );
      sectionHeader.classList.toggle("has-done", doneCount > 0);
    }

    // .tw-section-soonest is live-ticked by tick() — nothing to set here

    // Update alarm cards within section body
    const body = section.querySelector(".tw-section-body");
    const existingCards = new Map();
    body
      .querySelectorAll(".tw-alarm")
      .forEach((el) => existingCards.set(el.dataset.uid, el));

    alarms.forEach((a, cardIdx) => {
      const uid = a.id || a.name;
      let card = existingCards.get(uid);
      const isExisting = !!card;

      if (isExisting) {
        // Update existing card
        updateAlarmCard(card, a, uid);
        existingCards.delete(uid);
      } else {
        card = createAlarmNode(a, uid);
      }

      const currentAtIdx = body.children[cardIdx];
      if (currentAtIdx !== card) {
        if (currentAtIdx) body.insertBefore(card, currentAtIdx);
        else body.appendChild(card);
      }

      uiRefs.set(uid, {
        timeNode: card.querySelector(".t"),
        nameNode: card.querySelector(".n"),
        finishNode: card.querySelector(".tw-alarm-finish"),
        progressNode: card.querySelector(".tw-alarm-progress"),
        cardNode: card,
        // Preserve lastText for existing cards so tick() doesn't re-write DOM needlessly
        lastText: isExisting ? (uiRefs.get(uid)?.lastText ?? "") : "",
      });
    });

    // Remove cards that are no longer present and clean up uiRefs
    existingCards.forEach((card, uid) => {
      card.remove();
      uiRefs.delete(uid);
    });

    // Position section in list
    const currentSectionAtIdx = listContainer.children[idx];
    if (currentSectionAtIdx !== section) {
      if (currentSectionAtIdx)
        listContainer.insertBefore(section, currentSectionAtIdx);
      else listContainer.appendChild(section);
    }

    existingSections.delete(type);
  });

  // Remove sections that no longer have alarms
  existingSections.forEach((section) => section.remove());

  // Update ring strip
  updateRingStrip(groups);
  markLastExpandedSection(listContainer);
}

// ==========================================
// SECTION NODE
// ==========================================
function createSectionNode(type, meta) {
  const section = document.createElement("div");
  section.className = "tw-section";
  section.dataset.type = type;
  if (collapsedSections.has(type)) section.classList.add("is-collapsed");

  const iconHtml = makeUiIcon("chevronDown", "tw-section-chevron");

  section.innerHTML = `
        <div class="tw-section-header">
            ${iconHtml}
            <span class="tw-section-label" style="color: ${meta.color}">${meta.label}</span>
            <span class="tw-section-next-village"></span>
            <span class="tw-section-count">0</span>
            <button type="button" class="tw-section-clear" title="Clear all ${meta.label} timers">${makeUiIcon("trash")}</button>
            <span class="tw-section-done-badge"></span>
            <span class="tw-section-soonest"></span>
        </div>
        <div class="tw-section-body"></div>`;

  const clearBtn = section.querySelector(".tw-section-clear");
  clearBtn.onclick = (e) => {
    e.stopPropagation();
    const inSection = currentAlarms.filter((a) => classifyAlarm(a) === type);
    if (inSection.length === 0) return;
    if (confirm(`Clear all ${inSection.length} ${meta.label} timers?`)) {
      deleteAlarms(inSection);
    }
  };

  const header = section.querySelector(".tw-section-header");
  header.onclick = () => {
    section.classList.toggle("is-collapsed");
    if (section.classList.contains("is-collapsed")) {
      collapsedSections.add(type);
      expandedSections.delete(type);
    } else {
      collapsedSections.delete(type);
      expandedSections.add(type);
    }
    saveSectionState();
    markLastExpandedSection(section.parentElement);
  };

  return section;
}

// ==========================================
// RING STRIP
// ==========================================
function updateRingStrip(groups) {
  const strip = document.getElementById("_tw-rings");
  if (!strip) return;

  const now = Date.now();
  const sortedTypes = sortSectionTypes(Object.keys(groups), groups);

  // Reconcile existing rings
  const existingRings = new Map();
  strip
    .querySelectorAll(".tw-ring")
    .forEach((el) => existingRings.set(el.dataset.type, el));

  sortedTypes.forEach((type, idx) => {
    const alarms = groups[type];
    const meta = SECTION_META[type] || SECTION_META.building;
    const count = alarms.length;

    // Find soonest alarm for progress
    let soonest = alarms[0];
    alarms.forEach((a) => {
      if (a.scheduledTime < soonest.scheduledTime) soonest = a;
    });

    const uid = soonest.id || soonest.name;
    const firstSeen = firstSeenTimes.get(uid) || now;
    const totalDuration = Math.max(1, soonest.scheduledTime - firstSeen);
    const elapsed = now - firstSeen;
    let progress = Math.min(1, Math.max(0, elapsed / totalDuration));
    const isDone = soonest.scheduledTime <= now;

    // Compress the last 15% of the ring so long alarms don't look full
    // when nearly done: maps 0.85–1.0 → 0.85–0.95, keeping a visible gap
    if (!isDone && progress > 0.85) {
      progress = 0.85 + (progress - 0.85) * (2 / 4);
    }

    const circumference = 2 * Math.PI * 10;
    const dashOffset = circumference * (1 - progress);

    let ring = existingRings.get(type);
    if (!ring) {
      ring = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      ring.className = "tw-ring";
      ring.dataset.type = type;
      ring.title = meta.label;
      ring.innerHTML = `<svg viewBox="0 0 28 28" width="28" height="28">
                <circle class="tw-ring-bg" cx="14" cy="14" r="10"/>
                <circle class="tw-ring-fill" cx="14" cy="14" r="10"
                    stroke="${meta.color}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashOffset}"/>
                <text class="tw-ring-count" x="14" y="14" fill="${meta.color}">${count}</text>
            </svg>`;
      ring.onclick = () => {
        const section = listContainer.querySelector(
          `.tw-section[data-type="${type}"]`,
        );
        if (section) {
          section.classList.remove("is-collapsed");
          collapsedSections.delete(type);
          expandedSections.add(type);
          saveSectionState();
          section.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      };
    } else {
      // Update existing ring
      const fillCircle = ring.querySelector(".tw-ring-fill");
      if (fillCircle) {
        fillCircle.setAttribute("stroke-dashoffset", dashOffset);
        fillCircle.setAttribute("stroke", meta.color);
      }
      const countText = ring.querySelector(".tw-ring-count");
      if (countText) {
        countText.textContent = count;
        countText.setAttribute("fill", meta.color);
      }
      existingRings.delete(type);
    }

    ring.classList.toggle("is-done", isDone);

    const currentAtIdx = strip.children[idx];
    if (currentAtIdx !== ring) {
      if (currentAtIdx) strip.insertBefore(ring, currentAtIdx);
      else strip.appendChild(ring);
    }
  });

  // Remove rings for types no longer active
  existingRings.forEach((ring) => ring.remove());
}

// ==========================================
// TOOLTIP
// ==========================================
function createGlobalTooltip() {
  if (document.getElementById("_tw-tt")) return;
  const tt = document.createElement("div");
  tt.id = "_tw-tt";
  tt.style.display = "none";
  document.body.appendChild(tt);
  tooltipEl = tt;
}

function showTooltip(e, text) {
  if (!tooltipEl) createGlobalTooltip();
  tooltipEl.innerText = text;
  tooltipEl.style.display = "block";
  moveTooltip(e);
}

function moveTooltip(e) {
  if (!tooltipEl) return;
  const x = e.clientX - tooltipEl.offsetWidth - 10;
  const y = e.clientY - tooltipEl.offsetHeight - 15;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = "none";
}

// ==========================================
// VILLAGE LABEL (colored dot + name)
// ==========================================
function setVillageLabel(el, village) {
  if (el.dataset.village === village) return;
  el.dataset.village = village;
  el.textContent = "";
  if (!village) return;
  const dot = document.createElement("span");
  dot.className = "tw-village-dot";
  dot.style.background = `hsl(${villageHue(village)}, 70%, 55%)`;
  el.appendChild(dot);
  el.appendChild(document.createTextNode(village));
}

// ==========================================
// NAME-ONLY DISPLAY (no village, for card .n)
// ==========================================
function getNameOnlyDisplay(rawName, isRecurring) {
  const s = getStructuredName(rawName, isRecurring);
  let html = "";
  if (s.iconHtml) html += s.iconHtml;
  html += s.name;
  if (s.isRecurring)
    html += ` <span class="recurring-indicator" title="Recurring Alarm">↺</span>`;
  return html;
}

// ==========================================
// ALARM NODE (card) CREATION
// ==========================================
function createAlarmNode(a, uniqueId) {
  const typeClass = getTypeColorClass(a);
  const structured = getStructuredName(a.name, a.recurring > 0);
  const nameHtml = getNameOnlyDisplay(a.name, a.recurring > 0);
  const isCustom =
    a.name.startsWith("⭐") ||
    a.customType === "daily" ||
    a.customType === "farmlist";
  const pinnedClass = a.isPinned ? "is-pinned" : "";

  const div = document.createElement("div");
  div.className = `tw-alarm ${typeClass} ${pinnedClass}`;
  div.dataset.uid = uniqueId;

  const editBtnHtml = isCustom
    ? `<button class="tw-act-edit" title="Edit">${makeUiIcon("pencil")}</button>`
    : "";

  div.innerHTML = `
        <div class="tw-alarm-accent"></div>
        <div class="tw-alarm-progress"></div>
        <div class="tw-alarm-content">
            <div class="tw-alarm-name">
                <div class="n">${nameHtml}</div>
                ${structured.village ? `<div class="tw-alarm-village"></div>` : ""}
            </div>
            <div class="tw-alarm-timer">
                <span class="t">--:--</span>
                <span class="tw-alarm-finish"></span>
            </div>
        </div>
        <div class="tw-alarm-actions">
            <button class="tw-act-pin ${a.isPinned ? "is-active" : ""}" title="Pin">${makeUiIcon("pin")}</button>
            ${editBtnHtml}
            <button class="tw-act-delete" title="Delete">${makeUiIcon("trash")}</button>
        </div>`;

  const villageNode = div.querySelector(".tw-alarm-village");
  if (villageNode) setVillageLabel(villageNode, structured.village);

  setupAlarmListeners(div, a, uniqueId);
  return div;
}

function updateAlarmCard(card, a, uid) {
  const nameNode = card.querySelector(".n");
  const nameKey = `${a.recurring > 0}|${a.name}`;
  if (nameNode && card.dataset.nameKey !== nameKey) {
    card.dataset.nameKey = nameKey;
    nameNode.innerHTML = getNameOnlyDisplay(a.name, a.recurring > 0);
  }

  const structured = getStructuredName(a.name, a.recurring > 0);
  const villageNode = card.querySelector(".tw-alarm-village");
  if (villageNode) {
    setVillageLabel(villageNode, structured.village || "");
  } else if (structured.village) {
    const nameContainer = card.querySelector(".tw-alarm-name");
    if (nameContainer) {
      const vEl = document.createElement("div");
      vEl.className = "tw-alarm-village";
      setVillageLabel(vEl, structured.village);
      nameContainer.appendChild(vEl);
    }
  }

  const pinBtn = card.querySelector(".tw-act-pin");
  if (pinBtn) pinBtn.classList.toggle("is-active", !!a.isPinned);
  card.classList.toggle("is-pinned", !!a.isPinned);
}

// ==========================================
// ALARM EVENT LISTENERS
// ==========================================
function setupAlarmListeners(node, a, uniqueId) {
  // Pin
  const pinBtn = node.querySelector(".tw-act-pin");
  if (pinBtn) {
    pinBtn.onclick = (e) => {
      e.stopPropagation();
      pinBtn.classList.toggle("is-active");
      node.classList.toggle("is-pinned");
      api.runtime
        .sendMessage({ type: "TOGGLE_PIN", id: a.id })
        .then(() => syncState());
    };
  }

  // Edit (custom alarms only)
  const editBtn = node.querySelector(".tw-act-edit");
  if (editBtn) {
    editBtn.onclick = (e) => {
      e.stopPropagation();
      // The closure's `a` goes stale after edits (cards are reused without
      // re-binding listeners) — resolve the live alarm so the time prompt
      // reflects the current remaining time, not the pre-edit schedule.
      a = currentAlarms.find((x) => x.id === a.id) || a;
      let currentTag = serverTag;
      const tagMatch = a.name.match(/\[[^\]]+\]/);
      if (tagMatch) currentTag = tagMatch[0];

      const prefixMatch = a.name.match(/^(⭐|📅|🚜)\s*/u);
      const namePrefix = prefixMatch ? prefixMatch[1] : "⭐";
      let middleContent = a.name
        .replace(currentTag, "")
        .replace(/^(?:⭐|📅|🚜)\s*/u, "")
        .trim();
      let villageContext = "";
      let nameToEdit = middleContent;

      if (middleContent.includes("|")) {
        const parts = middleContent.split("|");
        nameToEdit = parts[0].trim();
        villageContext = parts[1].trim();
      } else {
        const pMatch = middleContent.match(/^(.*?)(\s\(.*?\))(\s#\d+)?$/);
        if (pMatch) {
          nameToEdit = pMatch[1].trim();
          villageContext = pMatch[2].replace(/[()]/g, "").trim();
        }
      }

      const newNameVal = prompt("Edit Name:", nameToEdit);
      if (newNameVal === null) return;

      const currentDurationStr = formatDurationForPrompt(
        a.scheduledTime - Date.now(),
      );
      const newTimeStr = prompt(
        "Edit Time Remaining (e.g. 15, 1:30):",
        currentDurationStr,
      );
      if (newTimeStr === null) return;

      let finalBaseName = newNameVal.trim() || nameToEdit;
      if (villageContext)
        finalBaseName = `${finalBaseName} | ${villageContext}`;

      const finalName = `${namePrefix} ${finalBaseName} ${currentTag}`;
      const newDelay = parseSmartDuration(newTimeStr);

      if (newNameVal !== nameToEdit || newDelay !== null) {
        api.runtime
          .sendMessage({
            type: "EDIT_ALARM",
            id: a.id,
            newName: finalName,
            newDelay: newDelay,
          })
          .then(() => syncState());
      }
    };
  }

  // Tooltip on timer
  const timerNode = node.querySelector(".t");
  if (timerNode) {
    timerNode.addEventListener("mouseenter", (e) => {
      if (timerNode.dataset.finishTime)
        showTooltip(e, timerNode.dataset.finishTime);
    });
    timerNode.addEventListener("mousemove", (e) => moveTooltip(e));
    timerNode.addEventListener("mouseleave", () => hideTooltip());
  }

  // Trigger click (silence / delete done alarms)
  const handleTriggerClick = () => {
    const now = Date.now();
    const isDone = a.scheduledTime - now <= 0;
    const isRecurring = a.recurring && a.recurring > 0;
    const isStickyRecurring =
      a.customType === "farmlist" || a.customType === "daily";
    if (isStickyRecurring) {
      // Daily alarms must re-arm to their set clock time so they always fire at
      // that time regardless of when they're reset; farm-list keeps its rolling
      // "now + period" behaviour.
      const newDelay =
        a.customType === "daily"
          ? nextDailyOccurrence(a.scheduledTime) - Date.now()
          : a.recurring;
      api.runtime
        .sendMessage({
          type: "EDIT_ALARM",
          id: a.id,
          newDelay,
        })
        .then(() => syncState());
      return;
    }
    if (isDone || isRecurring) {
      if (!silencedAlarms.has(uniqueId) && !a.silenced) {
        if (isDone) api.runtime.sendMessage({ type: "STOP_SOUND_ONLY" });
        silencedAlarms.add(uniqueId);
        api.runtime.sendMessage({ type: "SILENCE_ALARM", id: a.id });
        syncState();
        if (!isDone)
          setTimeout(() => {
            if (silencedAlarms.has(uniqueId)) {
              silencedAlarms.delete(uniqueId);
              syncState();
            }
          }, 5000);
      } else {
        if (isRecurring)
          api.runtime.sendMessage({
            type: "REFRESH_ALARMS",
            buildings: [
              {
                name: a.name,
                delay: a.recurring,
                recurring: a.recurring,
                customType: a.customType,
              },
            ],
          });
        api.runtime
          .sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name })
          .then(syncState);
      }
    }
  };

  const content = node.querySelector(".tw-alarm-content");
  if (content) content.onclick = handleTriggerClick;

  // Delete
  const deleteBtn = node.querySelector(".tw-act-delete");
  if (deleteBtn) {
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteAlarms([a]);
    };
  }
}

/**
 * Deletes a batch of alarms. The background persists attack dismissals.
 * @param {Object[]} alarms
 */
async function deleteAlarms(alarms) {
  if (alarms.length === 0) return;

  alarms.forEach((a) => {
    silencedAlarms.delete(a.id || a.name);
  });

  await Promise.all(
    alarms.map((a) =>
      api.runtime.sendMessage({ type: "DELETE_ALARM", id: a.id, name: a.name }),
    ),
  );
  syncState();
}

// ==========================================
// TICK (TIMER UPDATE) — once per second, driven from content.js
// ==========================================
let _doneCount = -1;
const _finishFormat = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function tick() {
  const now = Date.now();

  // An alarm finishing changes the sort order and section/ring state.
  const doneCount = currentAlarms.reduce((n, a) => n + (a.scheduledTime <= now), 0);
  if (doneCount !== _doneCount) {
    _doneCount = doneCount;
    renderAlarms();
  }

  // Section headers: done state + live countdown of the collapsed header
  const groups = {};
  currentAlarms.forEach((a) => {
    const type = classifyAlarm(a);
    (groups[type] ||= []).push(a);
  });
  for (const [type, alarms] of Object.entries(groups)) {
    const header = listContainer.querySelector(
      `.tw-section[data-type="${type}"] .tw-section-header`,
    );
    if (!header) continue;
    const done = alarms.filter((a) => a.scheduledTime <= now).length;
    header.classList.toggle("is-all-done", done === alarms.length);
    header.classList.toggle("has-done", done > 0);

    const doneBadge = header.querySelector(".tw-section-done-badge");
    if (doneBadge) {
      doneBadge.textContent = done ? "DONE" : "";
      doneBadge.style.display = done ? "" : "none";
    }

    // Done badge is showing — clear the timer so they don't both appear
    const soonestSpan = header.querySelector(".tw-section-soonest");
    if (soonestSpan) {
      const next = Math.min(...alarms.map((a) => a.scheduledTime));
      soonestSpan.textContent = done ? "" : formatHMS(Math.max(0, ((next - now) / 1000) | 0));
    }
  }
  updateRingStrip(groups);

  currentAlarms.forEach((a) => {
    const uniqueId = a.id || a.name;
    const ref = uiRefs.get(uniqueId);
    if (!ref || !ref.timeNode) return;

    // Finish time (tooltip + always-visible) only changes with the schedule
    if (ref.finishFor !== a.scheduledTime) {
      ref.finishFor = a.scheduledTime;
      const fTime = _finishFormat.format(a.scheduledTime);
      ref.timeNode.dataset.finishTime = `Finish: ${fTime}`;
      if (ref.finishNode) ref.finishNode.textContent = fTime;
    }

    const s = Math.max(0, ((a.scheduledTime - now) / 1000) | 0);
    const isSilenced = silencedAlarms.has(uniqueId) || a.silenced;
    const newText = s === 0 ? "DONE" : formatHMS(s);
    if (ref.lastText !== newText) ref.timeNode.textContent = newText;
    ref.lastText = newText;

    const flashing = s === 0 && !isSilenced;
    ref.timeNode.classList.toggle("flashing-alarm", flashing);
    ref.nameNode?.classList.toggle("flashing-alarm", flashing);
    if (ref.cardNode) {
      ref.cardNode.classList.toggle("is-done", s === 0);
      ref.cardNode.classList.toggle("is-silenced", s === 0 && isSilenced);
    }
    ref.timeNode.style.color = s !== 0 && isSilenced ? "#666" : "";

    if (ref.progressNode) {
      const firstSeen = firstSeenTimes.get(uniqueId) || now;
      const totalDuration = Math.max(1, a.scheduledTime - firstSeen);
      let progress = Math.min(1, Math.max(0, (now - firstSeen) / totalDuration));
      if (s !== 0 && progress > 0.85) progress = 0.85 + (progress - 0.85) * (2 / 3);
      ref.progressNode.style.setProperty("--progress", progress.toFixed(4));
    }
  });
}

// ==========================================
// SHORTCUTS
// ==========================================

/** Backfills a uid onto any shortcut that lacks one (migration for existing data). */
function _ensureShortcutUids(list) {
  let changed = false;
  const result = list.map((s) => {
    if (s.uid) return s;
    changed = true;
    return {
      ...s,
      uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    };
  });
  return { result, changed };
}

function loadShortcuts() {
  api.storage.local.get({ _w4sc: [], _w4hi: false }).then(async (res) => {
    let list = res._w4sc;
    if (!res._w4hi || (list && list.length === 0 && !res._w4hi)) {
      await api.storage.local.set({ _w4sc: DEFAULT_SHORTCUTS, _w4hi: true });
      list = DEFAULT_SHORTCUTS;
    }
    // Backfill uids for shortcuts created before this version
    const { result: migratedList, changed } = _ensureShortcutUids(list);
    if (changed) {
      await api.storage.local.set({ _w4sc: migratedList });
      list = migratedList;
    }
    const anchor = document.getElementById("_tw-da");
    if (!anchor) return;
    anchor.innerHTML = "";
    list.forEach((s) => {
      const opt = document.createElement("div");
      opt.className = "dropdown-option clickable";
      const durationMs = s.ms || s.minutes * 60 * 1000;

      const mode = s.isDaily ? "daily" : s.isFarmList ? "farmlist" : "off";
      const recurringActiveClass = mode !== "off" ? "is-active" : "";
      const recurringModeClass = mode === "daily" ? "is-daily" : "";
      const recurringTitle = {
        daily: "Daily Reset",
        farmlist: "Farm List",
        off: "One-shot",
      }[mode];
      const recurringLabel = {
        daily: "↺ d",
        farmlist: "↺ f",
        off: "↺",
      }[mode];

      opt.innerHTML = `<span>${s.label}</span><div class="shortcut-actions"><span class="recurring-toggle ${recurringActiveClass} ${recurringModeClass}" title="${recurringTitle}">${recurringLabel}</span><span class="edit-shortcut" title="Edit Shortcut">✎</span><span class="remove-shortcut" title="Delete Shortcut">✕</span></div>`;
      opt.onclick = (e) => {
        e.stopPropagation();
        handleDropdownAction(
          durationMs,
          s.label,
          s.isFarmList || false,
          s.isDaily || false,
        );
        closePanels();
      };
      const recBtn = opt.querySelector(".recurring-toggle");
      recBtn.onclick = (e) => {
        e.stopPropagation();
        cycleShortcutMode(s.uid);
      };
      const editBtnEl = opt.querySelector(".edit-shortcut");
      editBtnEl.onclick = (e) => {
        e.stopPropagation();
        editShortcut(s.uid, durationMs, s.label);
      };
      opt.querySelector(".remove-shortcut").onclick = (e) => {
        e.stopPropagation();
        deleteShortcut(s.uid);
      };
      anchor.appendChild(opt);
    });
  });
}

async function editShortcut(uid, oldMs, oldLabel) {
  const currentDurationStr = formatDurationForPrompt(oldMs);
  const newDurationStr = prompt(
    "Edit duration (e.g. 15, 13:30, 13.30):",
    currentDurationStr,
  );
  const newMs = parseSmartDuration(newDurationStr);
  if (newMs === null) return;
  const newLabel = prompt("Edit label:", oldLabel);
  if (!newLabel) return;
  const res = await api.storage.local.get({ _w4sc: [] });
  const newList = res._w4sc.map((s) => {
    if (s.uid !== uid) return s;
    return { ...s, label: newLabel, ms: newMs, minutes: undefined };
  });
  await api.storage.local.set({ _w4sc: newList });
  loadShortcuts();
}

async function cycleShortcutMode(uid) {
  const res = await api.storage.local.get({ _w4sc: [] });
  const newList = res._w4sc.map((s) => {
    if (s.uid !== uid) return s;
    // Cycle: off → farmlist → daily → off
    if (!s.isFarmList && !s.isDaily)
      return { ...s, isRecurring: false, isFarmList: true, isDaily: false };
    if (s.isFarmList)
      return { ...s, isRecurring: false, isFarmList: false, isDaily: true };
    return { ...s, isRecurring: false, isFarmList: false, isDaily: false };
  });
  await api.storage.local.set({ _w4sc: newList });
  loadShortcuts();
}

async function handleDropdownAction(val, label, isFarmList, isDaily) {
  if (val === "CREATE_NEW") {
    const durStr = prompt("Enter duration (e.g. 15, 13:30, 13.30):");
    const ms = parseSmartDuration(durStr);
    if (ms !== null) {
      const defaultLabel = formatDurationForPrompt(ms) + "m";
      const labelStr = prompt("Enter label:", defaultLabel);
      if (labelStr) {
        const res = await api.storage.local.get({ _w4sc: DEFAULT_SHORTCUTS });
        const newList = [
          ...res._w4sc,
          {
            uid:
              Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            label: labelStr,
            ms: ms,
            isRecurring: false,
          },
        ];
        await api.storage.local.set({ _w4sc: newList, _w4hi: true });
        loadShortcuts();
      }
    }
    return;
  }
  const vName = getActiveVillageName();
  const prefix = isDaily ? "📅" : isFarmList ? "🚜" : "⭐";
  const customType = isDaily ? "daily" : isFarmList ? "farmlist" : null;
  const isSticky = isFarmList || isDaily;
  api.runtime
    .sendMessage({
      type: "REFRESH_ALARMS",
      buildings: [
        {
          name: `${prefix} ${label} | ${vName} ${serverTag}`,
          delay: val,
          recurring: isSticky ? val : 0,
          customType,
        },
      ],
    })
    .then(() => syncState());
}

async function deleteShortcut(uid) {
  const res = await api.storage.local.get({ _w4sc: [] });
  const newList = res._w4sc.filter((s) => s.uid !== uid);
  await api.storage.local.set({ _w4sc: newList, _w4hi: true });
  loadShortcuts();
}

// ==========================================
// PANEL MANAGEMENT
// ==========================================
function closePanels() {
  document
    .querySelectorAll(".tw-panel")
    .forEach((p) => p.classList.remove("is-open"));
}

function togglePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const isOpen = panel.classList.contains("is-open");
  closePanels();
  if (!isOpen) panel.classList.add("is-open");
}

// ==========================================
// WIDGET HTML & CREATION
// ==========================================

const WIDGET_HTML = `
    <div class="tw-titlebar">
        <span class="tw-title">TravAlarm</span>
        <span class="tw-alarm-count" id="_tw-cnt">0</span>
        <div class="tw-titlebar-actions">
            <button id="_tw-mb" class="tw-icon-btn" title="Minimize">
                ${makeUiIcon("minimize")}
            </button>
        </div>
    </div>

    <div class="tw-ring-strip" id="_tw-rings"></div>

    <div class="tw-body">
        <div id="_tw-tl"></div>
    </div>

    <div class="tw-toolbar" id="_tw-toolbar">
        <button id="_tw-ti" class="tw-tool-btn" title="Add Custom Alarm">
            ${makeUiIcon("plus")}<span>Add</span>
        </button>
        <button id="_tw-db" class="tw-tool-btn" title="Quick Timers">
            ${makeUiIcon("lightning")}<span>Presets</span>
        </button>
        <button id="_tw-ab" class="tw-tool-btn" title="Sound Settings">
            ${makeUiIcon("speaker")}
        </button>
        <button id="_tw-ca" class="tw-tool-btn tw-tool-danger" title="Clear All">
            ${makeUiIcon("trash")}
        </button>
    </div>

    <div class="tw-panel" id="_tw-dm">
        <div class="tw-panel-header">Presets<button class="tw-panel-close" id="_tw-pc1">×</button></div>
        <div id="_tw-da"></div>
        <button class="tw-panel-add" id="_tw-cn">+ New Preset</button>
    </div>
    <div class="tw-panel" id="_tw-am">
        <div class="tw-panel-header">Sound Settings<button class="tw-panel-close" id="_tw-pc2">×</button></div>
        <div class="audio-volume-row">
            <label class="audio-volume-label">Vol</label>
            <input type="range" id="_tw-vol" class="audio-volume-slider" min="0" max="100" value="80">
            <span id="_tw-vol-val" class="audio-volume-val">80%</span>
        </div>
        <div id="_tw-cat-toggles"></div>
    </div>
`;

function createWidget() {
  const div = document.createElement("div");
  div.id = "_tw-w";
  div.innerHTML = WIDGET_HTML;
  document.body.appendChild(div);

  const minBtn = div.querySelector("#_tw-mb");
  const toggleBtn = div.querySelector("#_tw-ti");
  const listContainer = div.querySelector("#_tw-tl");
  const presetBtn = div.querySelector("#_tw-db");
  const audioBtn = div.querySelector("#_tw-ab");

  // Minimize
  minBtn.onclick = () => {
    div.classList.toggle("is-minimized");
    const isMin = div.classList.contains("is-minimized");
    minBtn.innerHTML = makeUiIcon(isMin ? "maximize" : "minimize");
  };

  // Panel close buttons
  div.querySelector("#_tw-pc1").onclick = (e) => {
    e.stopPropagation();
    closePanels();
  };
  div.querySelector("#_tw-pc2").onclick = (e) => {
    e.stopPropagation();
    closePanels();
  };

  // Presets panel
  presetBtn.onclick = (e) => {
    e.stopPropagation();
    togglePanel("_tw-dm");
  };
  div.querySelector("#_tw-cn").onclick = () =>
    handleDropdownAction("CREATE_NEW", "");

  // Audio panel
  audioBtn.onclick = (e) => {
    e.stopPropagation();
    togglePanel("_tw-am");
  };
  renderSoundCategoryToggles(div);

  // Volume slider
  const volSlider = div.querySelector("#_tw-vol");
  const volVal = div.querySelector("#_tw-vol-val");
  volSlider.addEventListener("input", () => {
    volVal.textContent = volSlider.value + "%";
    api.runtime
      .sendMessage({ type: "SET_VOLUME", volume: parseInt(volSlider.value) })
      .catch(() => {});
  });
  volSlider.addEventListener("pointerdown", () => {
    volSlider.dataset.dragging = "1";
  });
  const endDrag = () => delete volSlider.dataset.dragging;
  volSlider.addEventListener("pointerup", endDrag);
  volSlider.addEventListener("pointercancel", endDrag);
  volSlider.addEventListener("click", (e) => e.stopPropagation());
  volSlider.addEventListener("pointerdown", (e) => e.stopPropagation());

  // Close panels on outside click
  document.addEventListener("click", () => closePanels());

  // Add custom alarm
  toggleBtn.onclick = () => {
    const nameVal = prompt("Enter Alarm Name:");
    if (!nameVal) return;
    const timeVal = prompt(
      "Enter Duration (e.g. 15, 1:30, 0:45:00, 10pm, 10:30pm, 15:31:16pm):",
    );
    if (!timeVal) return;
    let delay = parseSmartDuration(timeVal);
    if (delay === null) {
      delay = calculateDelayFromSmartText(timeVal);
    }
    if (delay !== null && delay > 0) {
      const vName = getActiveVillageName();
      const finalName = `⭐ ${nameVal} | ${vName} ${serverTag}`;
      api.runtime
        .sendMessage({
          type: "REFRESH_ALARMS",
          buildings: [{ name: finalName, delay: delay, customType: "manual" }],
        })
        .then(() => syncState());
    } else {
      alert("Invalid time format.");
    }
  };

  // Clear all
  const clearBtn = div.querySelector("#_tw-ca");
  clearBtn.onclick = async () => {
    if (currentAlarms.length === 0) return;
    if (confirm("Clear all active timers?")) {
      const deletePromises = currentAlarms.map((a) =>
        api.runtime.sendMessage({ type: "DELETE_ALARM", name: a.name }),
      );
      await Promise.all(deletePromises);
      silencedAlarms.clear();
      syncState();
    }
  };

  return { timerWidget: div, listContainer, toggleBtn, audioBtn };
}
