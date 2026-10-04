/**
 * Travian NPC Resource Helper - Observers
 * MutationObservers for NPC dialog and market send.
 */
/* global NPC */

// ---- Needed Amounts Storage ----
NPC.PullDialogObserver = {
  STORAGE_KEY: NPC.STORAGE_KEYS.NEEDED_AMOUNTS,

  saveNeededAmounts(amounts, village, remain) {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          amounts,
          village: village || null,
          remain: remain || 0,
        }),
      );
    } catch (e) {
      NPC.log.warn("Failed to save needed amounts", e);
    }
  },

  /** Parses and returns stored data, or null if missing/expired. Removes expired entries. */
  _loadStoredData() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      const data = JSON.parse(stored);
      if (Date.now() - data.timestamp > 30 * 60 * 1000) {
        localStorage.removeItem(this.STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  loadNeededAmounts() {
    return this._loadStoredData()?.amounts ?? null;
  },

  loadNeededVillage() {
    return this._loadStoredData()?.village ?? null;
  },

  loadNeededRemain() {
    return this._loadStoredData()?.remain ?? 0;
  },

  updateNeededAmounts() {
    const npcData = NPC.ResourceParser.parseNPCDialog();
    this.saveNeededAmounts(
      npcData.needed,
      this._getCurrentVillageInfo(),
      npcData.remain,
    );
  },

  _getCurrentVillageInfo() {
    const params = new URLSearchParams(location.search);
    let did = params.get("newdid") || params.get("did") || null;

    // Fallback: hero status link always contains the current village's newdid
    if (!did) {
      const heroLink = document.querySelector('.heroStatus a[href*="newdid="]');
      did = heroLink?.href.match(/[?&]newdid=(\d+)/)?.[1] ?? null;
    }

    const nameEl = document.querySelector(
      "#sidebarBoxVillagelist .listEntry.active .name, " +
        ".villageList .listEntry.active .name, " +
        ".villageList .active .name, " +
        ".activeVillage .name, " +
        '[class*="villagelist"] .active .name, ' +
        '[class*="villageList"] .active .name',
    );
    const name = nameEl?.innerText?.trim() || null;

    return did || name ? { did, name } : null;
  },
};

// ---- Hero Page Observer (display-only indicator) ----
NPC.HeroPageObserver = {
  init() {
    if (this._isMarketplace()) {
      this._showNeededIndicator();
    }
  },

  _isMarketplace() {
    return window.location.href.includes("/build.php?gid=17&t=5");
  },

  _showNeededIndicator() {
    // dont show on adventure tab
    const isAdventureTab =
      window.location.pathname.includes("/hero/adventures") ||
      document.querySelector(".adventureWrapper, #adventureList") !== null;
    if (isAdventureTab) return;

    const amounts = NPC.PullDialogObserver.loadNeededAmounts();
    if (!amounts) return;

    const neededList = [];
    for (let i = 0; i < 4; i++) {
      if (amounts[i] > 0)
        neededList.push({
          name: NPC.RESOURCE_NAMES[i],
          icon: NPC.RESOURCE_ICONS[i],
          amount: amounts[i],
        });
    }
    if (neededList.length === 0) return;

    // Load saved position (if any). Coordinates are stored as top/left in px.
    // Clamp to current viewport in case the window shrank since last save —
    // otherwise an off-screen panel can't be dragged back into view.
    let savedPos = null;
    try {
      const raw = localStorage.getItem(NPC.STORAGE_KEYS.INDICATOR_POS);
      if (raw) {
        const p = JSON.parse(raw);
        savedPos = {
          top: Math.max(0, Math.min(window.innerHeight - 20, p.top | 0)),
          left: Math.max(-240, Math.min(window.innerWidth - 20, p.left | 0)),
        };
      }
    } catch {}

    const POS_STYLE = savedPos
      ? `top:${savedPos.top}px;left:${savedPos.left}px;`
      : "bottom:165px;right:512px;";

    const INDICATOR_STYLE =
      `position:fixed;${POS_STYLE}` +
      "background:linear-gradient(135deg,#5a9e2f,#3a6d12);color:#fff;" +
      "padding:12px 16px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.25);" +
      "z-index:10000;font-family:Verdana,sans-serif;font-size:12px;max-width:260px;" +
      "user-select:none;";
    const BTN_STYLE =
      "margin-top:6px;padding:5px 10px;" +
      "background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);" +
      "border-radius:4px;color:#fff;cursor:pointer;width:100%;font-size:11px;font-family:inherit;";
    const STEPPER_BTN_STYLE =
      "padding:1px 8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);" +
      "border-radius:3px;color:#fff;cursor:pointer;font-size:14px;line-height:1.4;font-family:inherit;";

    // Randomise internal IDs per-session so scanners can't target stable selectors
    const sfx = Math.random().toString(36).slice(2, 8);
    const ID = {
      wrap: "_w" + sfx,

      close: "_c" + sfx,
      dec: "_d" + sfx,
      inc: "_i" + sfx,
      val: "_v" + sfx,
      pull: "_p" + sfx,
      pullDiv: "_pd" + sfx,
    };

    let split = 1;

    const indicator = document.createElement("div");
    indicator.id = ID.wrap;
    indicator.style.cssText = INDICATOR_STYLE;

    const village = NPC.PullDialogObserver.loadNeededVillage();

    const COPY_BTN_STYLE =
      "padding:1px 6px;margin-left:6px;background:rgba(255,255,255,0.15);" +
      "border:1px solid rgba(255,255,255,0.35);border-radius:3px;color:#fff;" +
      "cursor:pointer;font-size:11px;line-height:1.4;font-family:inherit;";

    const total = NPC.PullDialogObserver.loadNeededRemain();
    const renderRows = () => {
      // Title doubles as the drag handle — `_npc-drag` class is what the
      // mousedown listener checks via closest(). cursor:move telegraphs it.
      let html = `<div class="_npc-drag" title="Drag to move" style="font-weight:700;cursor:move;margin-bottom:${village?.name ? 2 : 6}px;">⠿ Resources Needed</div>`;
      if (village?.name) {
        html += `<div style="font-size:10px;opacity:0.75;margin-bottom:6px;">for ${village.name} (${total})</div>`;
      }
      neededList.forEach((item) => {
        const per = split > 1 ? Math.floor(item.amount / split) : item.amount;
        const perStr =
          split > 1
            ? `<span style="opacity:0.6;font-size:10px;margin-left:4px;">× ${split} = ${item.amount}</span>`
            : "";
        html += `<div style="display:flex;align-items:center;margin:3px 0;">
					<span style="margin-right:5px;">${item.icon}</span>
					<span style="flex:1;">${item.name}</span>
					<span style="font-weight:700;">+ ${per}${perStr}</span>
					<button class="_npc-copy" data-val="${per}" style="${COPY_BTN_STYLE}">&#x2398;</button>
				</div>`;
      });

      // Split stepper
      html +=
        `<div style="display:flex;align-items:center;justify-content:space-between;` +
        `margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.2);">` +
        `<span style="font-size:10px;opacity:0.8;">Deliveries:</span>` +
        `<div style="display:flex;align-items:center;gap:6px;">` +
        `<button id="${ID.dec}" style="${STEPPER_BTN_STYLE}" ${split <= 1 ? "disabled" : ""}>−</button>` +
        `<span id="${ID.val}" style="font-weight:700;min-width:14px;text-align:center;">${split}</span>` +
        `<button id="${ID.inc}" style="${STEPPER_BTN_STYLE}" ${split >= 9 ? "disabled" : ""}>+</button>` +
        `</div></div>`;

      // Pull buttons — drive the hero inventory popups directly
      const PULL_BTN_STYLE =
        "margin-top:6px;padding:6px 10px;" +
        "background:rgba(255,255,255,0.22);border:1px solid rgba(255,255,255,0.5);" +
        "border-radius:4px;color:#fff;cursor:pointer;width:100%;font-size:11px;" +
        "font-weight:700;font-family:inherit;";
      // ÷4 uses the NPC dialog's actual deficit (shown as the negative
      // number in parens next to the village name) — not the sum of
      // per-resource needs, since current surpluses can offset those.
      const deficit = Math.abs(total);
      const perResForNpc = Math.floor(deficit / split / 4);
      html += `<button id="${ID.pull}" style="${PULL_BTN_STYLE}" title="Pull each needed resource from hero inventory">⤓ Pull exact amounts</button>`;
      html += `<button id="${ID.pullDiv}" style="${PULL_BTN_STYLE}" title="Pull ${NPC.Utils.formatNumber(perResForNpc)} of each resource (total ${NPC.Utils.formatNumber(perResForNpc * 4)}) — for NPC trade after">⤓ Pull ÷4 for NPC (${NPC.Utils.formatNumber(perResForNpc)} ×4)</button>`;

      html += `<button id="${ID.close}" style="${BTN_STYLE}margin-top:8px;">Dismiss</button>`;
      return html;
    };

    const rebind = () => {
      indicator.innerHTML = renderRows();

      indicator.querySelectorAll("._npc-copy").forEach((btn) => {
        btn.addEventListener("click", () => {
          navigator.clipboard.writeText(btn.dataset.val).then(() => {
            const orig = btn.textContent;
            btn.textContent = "\u2713";
            setTimeout(() => {
              btn.textContent = orig;
            }, 900);
          });
        });
      });

      indicator.querySelector("#" + ID.dec).addEventListener("click", () => {
        if (split <= 1) return;
        split--;
        rebind();
      });
      indicator.querySelector("#" + ID.inc).addEventListener("click", () => {
        if (split >= 9) return;
        split++;
        rebind();
      });

      indicator.querySelector("#" + ID.close).addEventListener("click", () => {
        localStorage.removeItem(NPC.PullDialogObserver.STORAGE_KEY);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        indicator.remove();
      });

      indicator.querySelector("#" + ID.pull).addEventListener("click", () => {
        const amounts = [0, 0, 0, 0];
        neededList.forEach((r) => {
          const idx = NPC.RESOURCE_NAMES.indexOf(r.name);
          if (idx >= 0) amounts[idx] = Math.floor(r.amount / split);
        });
        NPC.HeroPuller.requestPull(amounts, "exact");
      });

      indicator.querySelector("#" + ID.pullDiv).addEventListener("click", () => {
        const deficit = Math.abs(total);
        const per = Math.floor(deficit / split / 4);
        if (per <= 0) return;
        NPC.HeroPuller.requestPull([per, per, per, per], "divided");
      });
    };

    // Drag-to-move. Delegated on the indicator so it survives rebind()
    // tearing down innerHTML. Drag starts only when the mousedown lands on
    // an element with the `_npc-drag` class (the title bar).
    let dragState = null;
    indicator.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!e.target.closest("._npc-drag")) return;
      e.preventDefault();
      const rect = indicator.getBoundingClientRect();
      // Pin to top/left for the rest of the lifetime so dragging from a
      // bottom/right-anchored starting position doesn't jump on first move.
      indicator.style.top = rect.top + "px";
      indicator.style.left = rect.left + "px";
      indicator.style.bottom = "auto";
      indicator.style.right = "auto";
      dragState = {
        offX: e.clientX - rect.left,
        offY: e.clientY - rect.top,
      };
    });

    const onMove = (e) => {
      if (!dragState) return;
      const w = indicator.offsetWidth;
      const h = indicator.offsetHeight;
      // Keep at least 20px of the panel inside the viewport on every edge
      const minX = 20 - w;
      const minY = 0;
      const maxX = window.innerWidth - 20;
      const maxY = window.innerHeight - 20;
      const left = Math.max(minX, Math.min(maxX, e.clientX - dragState.offX));
      const top = Math.max(minY, Math.min(maxY, e.clientY - dragState.offY));
      indicator.style.left = left + "px";
      indicator.style.top = top + "px";
    };

    const onUp = () => {
      if (!dragState) return;
      dragState = null;
      try {
        localStorage.setItem(
          NPC.STORAGE_KEYS.INDICATOR_POS,
          JSON.stringify({
            top: parseInt(indicator.style.top, 10) || 0,
            left: parseInt(indicator.style.left, 10) || 0,
          }),
        );
      } catch {}
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    rebind();
    document.body.appendChild(indicator);
  },
};

// ---- Resource Transfer Dialog Observer ----
// Watches Travian's native hero→village resource transfer dialog
// (`.resourceTransferDialog`) and injects two running totals:
//   - Needed: snapshot of the values Travian pre-fills when the dialog opens
//     (= deficit between village stock and the requested target threshold)
//   - Selected: live sum of whatever the user currently has typed in
// This lets the user see at a glance how their adjustments compare to the
// originally-requested pull without manually adding the four boxes.
NPC.TransferDialogObserver = {
  _injected: new WeakSet(),
  // Latest { target:[l,c,i,cr], ts } captured from openResourceTransfer by the
  // MAIN-world bridge (hero-bridge.js). Travian calls that with the full cost
  // just before the dialog renders, so this holds the real per-resource target
  // for whichever dialog is about to open — regardless of how it was opened.
  _lastTarget: null,

  start() {
    document.addEventListener("npc:transfer-target", (e) => {
      if (e.detail && Array.isArray(e.detail.target)) this._lastTarget = e.detail;
    });
  },

  _inject(dlg) {
    if (this._injected.has(dlg)) return;
    const names = ["lumber", "clay", "iron", "crop"];
    const inputs = names.map((n) => dlg.querySelector(`input[name="${n}"]`));
    if (inputs.some((i) => !i)) return;
    this._injected.add(dlg);

    // Per-resource target cost for this dialog, [lumber, clay, iron, crop],
    // captured from openResourceTransfer by the bridge (see _lastTarget). The
    // dialog's pre-filled boxes are only the *clamped* deficits
    // max(0, target_i - stock_i), which discard any surplus, so the real
    // targets can't be recovered from the DOM — we rely on the capture.
    const cap = this._lastTarget;
    const targets =
      cap && Array.isArray(cap.target) && Date.now() - cap.ts < 10000
        ? cap.target.map((v) => parseInt(v, 10) || 0)
        : null;

    // How much the hero needs to transfer in TOTAL, snapshotted once at
    // injection time so later edits to the inputs don't move the goalpost.
    //
    // For a gold NPC trade only the TOTAL volume matters: the merchant
    // redistributes the village's combined resources into any split, so a
    // surplus in one resource covers a deficit in another. When we know the
    // targets the real shortfall is
    //   max(0, sum(target) - sum(villageStock))   [stock from #l1..#l4,
    // the same source ui.js reads] — far less than summing Travian's clamped
    // per-resource deficits, which discards those surpluses. For natively-
    // opened dialogs (no targets) we fall back to that clamped sum.
    const neededTotal = (() => {
      if (targets) {
        const targetTotal = targets.reduce((a, b) => a + b, 0);
        const stockTotal = [1, 2, 3, 4].reduce(
          (sum, n) =>
            sum +
            (NPC.Utils.parseNumber(
              document.querySelector("#l" + n)?.textContent,
            ) || 0),
          0,
        );
        return Math.max(0, targetTotal - stockTotal);
      }
      return inputs
        .map((i) => NPC.Utils.parseNumber(i.value) || 0)
        .reduce((a, b) => a + b, 0);
    })();

    const totalsEl = document.createElement("div");
    totalsEl.className = "_npc-transfer-totals";
    totalsEl.style.cssText =
      "display:flex;justify-content:space-between;gap:12px;" +
      "margin:8px 0;padding:6px 10px;" +
      "background:rgba(0,0,0,0.04);border-radius:4px;" +
      "font-size:13px;font-weight:400;" +
      "font-family:Arial,Helvetica,Verdana,sans-serif;";

    const fmt = (n) => NPC.Utils.formatNumber(n);
    // Match Travian's native pattern (.limit rows): labels regular (400),
    // numeric values bold (700), and use the dialog's native green.
    // Green once the transferred total covers the need — for an NPC trade
    // exceeding it is harmless, so there's no "too much" warning.
    // Re-rendered only when the selected total actually changes.
    let shown = null;
    const recompute = () => {
      const sel = inputs.reduce(
        (sum, i) => sum + (NPC.Utils.parseNumber(i.value) || 0),
        0,
      );
      if (sel === shown) return;
      shown = sel;
      const color = sel >= neededTotal ? "#228B22" : "#888";
      totalsEl.innerHTML =
        `<span>Needed: <b>${fmt(neededTotal)}</b></span>` +
        `<span style="color:${color};">Selected: <b>${fmt(sel)}</b></span>`;
    };

    inputs.forEach((i) => {
      i.addEventListener("input", recompute);
      i.addEventListener("change", recompute);
      i.addEventListener("keyup", recompute);
    });
    // Travian's stepper/slider updates the input.value programmatically,
    // which does not fire input/change/keyup. Poll while the dialog is in
    // the DOM and stop as soon as it's removed.
    const poll = setInterval(() => {
      if (dlg.isConnected) recompute();
      else clearInterval(poll);
    }, 250);

    // Place totals just above the Transfer button (the .actionButton sits
    // after the four .resourceRow entries inside .contentV2). Falls back to
    // appending at the end of contentV2 if the layout ever changes.
    const content = dlg.querySelector(".contentV2") || dlg;
    const actionBtn = content.querySelector(".actionButton");
    if (actionBtn) {
      content.insertBefore(totalsEl, actionBtn);
    } else {
      content.appendChild(totalsEl);
    }

    // Surface the per-resource amount needed right after Travian's green
    // "after-pull" number in each row header (.resourceRowHeader span.limit),
    // so the user can compare what they'll have against what each resource
    // needs. Only when we know the targets (extension-opened pull).
    if (targets) {
      inputs.forEach((inp, i) => {
        const row = inp.closest(".resourceRow");
        const green = row?.querySelector(".resourceRowHeader span.limit");
        if (
          !green ||
          green.nextElementSibling?.classList.contains("_npc-need")
        ) {
          return;
        }
        const need = document.createElement("span");
        need.className = "_npc-need";
        need.textContent = `(${fmt(targets[i])})`;
        need.style.cssText = "color:#d9a441;font-weight:700;margin:0 4px;";
        green.after(need);
      });
    }

    recompute();
  },
};

// ---- NPC Dialog Observer ----
// The only body-wide observer in this extension. Each added element is tested
// once against a combined selector; the NPC and hero-transfer dialogs are only
// looked up on a hit.
NPC.NPCObserver = {
  _WATCH: "#npc, .exchangeResources, .resourceTransferDialog",

  start() {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node.matches(this._WATCH) || node.querySelector(this._WATCH))
          ) {
            this._checkNode(node);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    this._checkNode(document.body);
    this._setupExchangeButtonListener();
  },

  _setupExchangeButtonListener() {
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("button.exchange");
        if (!btn) return;
        const unitId = this._unitIdForExchangeButton(btn);
        if (!unitId) return;
        sessionStorage.setItem(
          NPC.STORAGE_KEYS.PENDING_TROOP,
          JSON.stringify({ unitId, time: Date.now() }),
        );
      },
      true,
    );
  },

  // Resolve which unit's "exchange" (NPC) button was clicked.
  //
  // The unit icon's `uN` class is the source of truth (tribe-detector reads it
  // the same way). We do NOT trust the row's `trooptN` class: the Residence/
  // Palace hardcodes the admin slot troopt9 and the settler slot troopt10 for
  // every tribe, so only Romans line up — an Egyptian settler row is troopt10
  // but the unit is really u60. Reading the icon is correct for barracks/stable/
  // workshop too, where the icon and `trooptN` always agree.
  _unitIdForExchangeButton(btn) {
    const scope =
      btn.closest(".action.troop") ||
      btn.closest("table.troop_details, tr, .troop, form");
    if (scope) {
      for (const el of scope.querySelectorAll('[class*="unit"]')) {
        if (typeof el.className !== "string") continue;
        const m = el.className.match(/\bu(\d{1,2})\b/);
        if (!m) continue;
        const id = Number(m[1]);
        // Playable unit ids only: 1-30 (Rom/Teu/Gaul), 51-80 (Egy/Hun/Spa).
        // 31-50 are Nature/Natars.
        if ((id >= 1 && id <= 30) || (id >= 51 && id <= 80)) return id;
      }
    }

    // Fallback: no unit icon found — derive from the `trooptN` class.
    const troopAction = btn.closest(".action.troop");
    if (troopAction) {
      const troopClass = Array.from(troopAction.classList).find((c) =>
        /^troopt\d+$/.test(c),
      );
      if (troopClass) {
        const id = parseInt(troopClass.replace("troopt", ""), 10);
        if (id) return id;
      }
    }
    return null;
  },

  _checkNode(node) {
    const transfer = node.matches(".resourceTransferDialog")
      ? [node]
      : node.querySelectorAll(".resourceTransferDialog");
    transfer.forEach((d) => NPC.TransferDialogObserver._inject(d));

    const npc =
      node.querySelector?.("#npc") ||
      (node.id === "npc" ? node : null) ||
      node.querySelector?.(".exchangeResources");
    if (npc && !document.querySelector("#_rh-ui")) {
      NPC.PullDialogObserver.updateNeededAmounts();
      this._watchDesiredInputs();
      // Only render the menu when the NPC dialog was opened from a specific
      // troop row — i.e. the click handler in _setupExchangeButtonListener
      // captured a unit id into PENDING_TROOP. Any other NPC dialog (building
      // upgrade, generic marketplace NPC, etc.) leaves PENDING_TROOP empty
      // and we stay out of the way entirely.
      if (!this._hasFreshPendingTroop()) return;
      // Lock toggles are owned by page-lock.js (runs in MAIN world via manifest).
      setTimeout(() => NPC.UIManager.createUI(), NPC._rand(80, 180));
    }
  },

  // Window after a troop-row "exchange" click during which we still trust
  // the captured unit id. 30s is generous — the page navigates almost
  // immediately. Stale entries are ignored so re-opening a non-troop NPC
  // dialog hours later doesn't accidentally re-trigger the menu.
  _PENDING_TROOP_TTL_MS: 30 * 1000,

  _hasFreshPendingTroop() {
    try {
      const raw = sessionStorage.getItem(NPC.STORAGE_KEYS.PENDING_TROOP);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.unitId) return false;
      if (Date.now() - (data.time || 0) > this._PENDING_TROOP_TTL_MS) {
        sessionStorage.removeItem(NPC.STORAGE_KEYS.PENDING_TROOP);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  _watchDesiredInputs() {
    const onDesiredChange = () => NPC.PullDialogObserver.updateNeededAmounts();
    for (let i = 0; i < 4; i++) {
      const input = document.querySelector(`input[name="desired${i}"]`);
      if (input && !input._npcWatched) {
        input._npcWatched = true;
        input.addEventListener("change", onDesiredChange);
        input.addEventListener("keyup", onDesiredChange);
      }
    }
  },
};
