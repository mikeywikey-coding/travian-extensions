/**
 * Travian NPC Resource Helper - UI Manager
 * Tribe is auto-detected but can be manually overridden via dropdown.
 * Pull tab replaced with read-only resource needs display.
 */
/* global NPC */

NPC.UIManager = {
  containerEl: null,
  _activeFaction: null,
  _troop: null,

  createUI() {
    if (document.querySelector("#_rh-ui")) return;

    const npcTable = document.querySelector("#npc");
    if (!npcTable) return;

    NPC.applyServerType(NPC.detectServerType());

    // Auto-detect tribe
    const detectedFaction = NPC.TribeDetector.detect();
    this._activeFaction = detectedFaction;

    this.containerEl = document.createElement("div");
    this.containerEl.id = "_rh-ui";
    // Single-purpose panel: Troop Calc only. The old "Needs" tab was
    // removed entirely — the panel itself only mounts when the user clicked
    // an NPC trade row for a specific unit, so a needs view here is
    // redundant.
    this.containerEl.innerHTML = `
            <div class="_r-panel">
                <!-- Troop Calculator -->
                <div class="_r-tab-content" id="_r-tab-troops">
                    <div class="_r-troop-calc">
                        <div class="_r-tribe-selector-row">
                            <select id="_r-tribe-select" class="_r-select _r-tribe-select"></select>
                            <select id="_r-server-type" class="_r-select _r-server-type-select">
                                <option value="classic">3 Tribes Classic</option>
                                <option value="fivetribe">5 Tribe</option>
                                <option value="rebalanced">6 Tribe Rebalanced</option>
                            </select>
                        </div>
                        <div id="_r-troop-body"></div>
                    </div>
                </div>
            </div>
        `;

    // Insert after native "exchange resources" gold button if present
    const redeemEl = npcTable.parentNode.querySelector(
      "button.gold.exchange, button.exchange.gold",
    );
    if (redeemEl) {
      redeemEl.insertAdjacentElement("afterend", this.containerEl);
    } else {
      npcTable.parentNode.appendChild(this.containerEl);
    }

    // Populate tribe selector
    this._buildTribeSelector(detectedFaction);

    // Build troop list for active faction
    this._renderTroopBody();

    this._autoSelectTroopFromContext();
  },

  _buildTribeSelector(detectedFaction) {
    const select = document.querySelector("#_r-tribe-select");
    if (!select) return;

    // Server type selector
    const serverSelect = document.querySelector("#_r-server-type");
    if (serverSelect) {
      serverSelect.value = NPC.serverType;
      serverSelect.addEventListener("change", (e) => {
        NPC.applyServerType(e.target.value);
        this._troop = null;
        this._populateTribeOptions(detectedFaction);
        this._renderTroopBody();
      });
    }

    this._populateTribeOptions(detectedFaction);

    select.addEventListener("change", (e) => {
      this._activeFaction = e.target.value || null;
      this._troop = null;
      this._renderTroopBody();
    });
  },

  _populateTribeOptions(detectedFaction) {
    const select = document.querySelector("#_r-tribe-select");
    if (!select) return;

    const prevValue = this._activeFaction;
    select.innerHTML = "";

    // Sort tribes by id for consistent order
    const tribes = Object.entries(NPC.TROOP_DATA).sort(
      (a, b) => a[1].id - b[1].id,
    );

    for (const [key, data] of tribes) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = data.name;
      select.appendChild(opt);
    }

    // Restore previous selection if still available, else use detected
    if (prevValue && NPC.TROOP_DATA[prevValue]) {
      select.value = prevValue;
      this._activeFaction = prevValue;
    } else if (detectedFaction && NPC.TROOP_DATA[detectedFaction]) {
      select.value = detectedFaction;
      this._activeFaction = detectedFaction;
    } else {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— Select tribe —";
      placeholder.selected = true;
      placeholder.disabled = true;
      select.insertBefore(placeholder, select.firstChild);
      this._activeFaction = null;
    }
  },

  _renderTroopBody() {
    const body = document.querySelector("#_r-troop-body");
    if (!body) return;

    const factionData = this._activeFaction
      ? NPC.TROOP_DATA[this._activeFaction]
      : null;

    if (!factionData) {
      body.innerHTML = `
                <div class="_r-info-block warn">
                    Select your tribe above, or visit a building page to auto-detect.
                </div>
            `;
      return;
    }

    // The unit-picker list was removed — the panel now only mounts when an
    // NPC trade row click captured a specific unit into PENDING_TROOP, so
    // _autoSelectTroopFromContext already knows the right troop. Cost,
    // capacity and preview blocks stay hidden until that auto-select fires.
    body.innerHTML = `
            <div id="_r-troop-cost" style="display:none;"></div>
            <div id="_r-can-build" style="display:none;"></div>

            <div class="_r-field" id="_r-build-wrap" style="display:none;">
                <label class="_r-label">Build amount</label>
                <div class="_r-build-row">
                    <input type="number" id="_r-build-count" class="_r-input" min="0" value="20" />
                    <button type="button" id="_r-build-max" class="_r-btn _r-btn-small" title="Set to max buildable">Max</button>
                </div>
            </div>

            <div id="_r-resource-preview" style="display:none;"></div>
        `;

    const buildCount = document.querySelector("#_r-build-count");
    buildCount.addEventListener("input", () => this._updatePreview());
    // Click-to-select: a single click on the build amount selects the current
    // value (e.g. the default 0) so the user can immediately type over it
    // without an extra triple-click or backspace. `focus` alone fires on tab
    // navigation too — `click` keeps it specifically to mouse interaction.
    // The setTimeout(0) waits one tick so the browser's own click handling
    // (which sets caret position) finishes first, then we override with select.
    buildCount.addEventListener("click", () => {
      setTimeout(() => buildCount.select(), 0);
    });
    document
      .querySelector("#_r-build-max")
      .addEventListener("click", () => this._setMaxTroops());
  },

  _autoSelectTroopFromContext(attempt = 0) {
    if (!this._activeFaction) return;
    const troops = NPC.TROOP_DATA[this._activeFaction].troops;

    // Primary: use the exchange button click captured before the dialog opened
    try {
      const stored = sessionStorage.getItem(NPC.STORAGE_KEYS.PENDING_TROOP);
      if (stored) {
        const { unitId, time } = JSON.parse(stored);
        if (Date.now() - time < 15000) {
          const idx = troops.findIndex((t) => t.unit === "u" + unitId);
          if (idx >= 0) {
            sessionStorage.removeItem(NPC.STORAGE_KEYS.PENDING_TROOP);
            this._selectTroop(idx);
            return;
          }
        } else {
          sessionStorage.removeItem(NPC.STORAGE_KEYS.PENDING_TROOP);
        }
      }
    } catch (e) {
      NPC.log.warn("Failed to read pending troop from sessionStorage", e);
    }

    // Fallback: match desired input values against troop costs (handles 1x exact + any-speed ratio)
    const values = NPC.Utils.getDesiredValues();
    if (!values.some((v) => v > 0)) {
      if (attempt < 8)
        setTimeout(
          () => this._autoSelectTroopFromContext(attempt + 1),
          NPC._rand(120, 200),
        );
      return;
    }

    for (let i = 0; i < troops.length; i++) {
      const cost = troops[i].cost;
      if (cost.every((c, idx) => c === values[idx])) {
        this._selectTroop(i);
        return;
      }
      const pairs = cost.map((c, idx) => ({ c, v: values[idx] }));
      const nonZero = pairs.filter((p) => p.c > 0);
      if (nonZero.length > 0) {
        const speed = nonZero[0].v / nonZero[0].c;
        if (
          Number.isInteger(speed) &&
          speed > 0 &&
          pairs.every((p) => (p.c === 0 ? p.v === 0 : p.v / p.c === speed))
        ) {
          this._selectTroop(i);
          return;
        }
      }
    }

    if (attempt < 8)
      setTimeout(
        () => this._autoSelectTroopFromContext(attempt + 1),
        NPC._rand(120, 200),
      );
  },

  _selectTroop(troopIdx) {
    if (!document.querySelector("#_r-troop-body")) return;
    const troop = NPC.TROOP_DATA[this._activeFaction].troops[troopIdx];
    this._troop = troop;

    const costEl = document.querySelector("#_r-troop-cost");
    costEl.style.display = "";
    costEl.innerHTML = `
            <div class="_r-cost-header">${NPC.Utils.unitIcon(troop.unit)} ${troop.name} — cost per unit</div>
            <div class="_r-cost-grid">
                ${troop.cost
                  .map(
                    (c, i) => `
                    <div class="_r-cost-item">
                        <span class="_r-cost-icon">${NPC.RESOURCE_ICONS[i]}</span>
                        <span class="_r-cost-val">${NPC.Utils.formatNumber(c)}</span>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        `;

    this._refreshTroopInfo();

    document.querySelector("#_r-build-wrap").style.display = "";
    // Default build amount is 20 — covers the common "queue a small batch"
    // case without making the user type anything. _updatePreview renders the
    // cost grid and the Send/Pull buttons immediately based on that value.
    document.querySelector("#_r-build-count").value = 20;
    this._updatePreview();
  },

  _refreshTroopInfo() {
    const troop = this._troop;
    if (!troop) return;

    const canBuildEl = document.querySelector("#_r-can-build");
    canBuildEl.style.display = "";

    const npcData = NPC.ResourceParser.parseNPCDialog();
    const totalPool = npcData.total;

    const totalCostPerUnit = troop.cost.reduce((a, b) => a + b, 0);
    const maxTheoretical =
      totalCostPerUnit > 0 ? Math.floor(totalPool / totalCostPerUnit) : 0;

    // Trimmed down to just the max-buildable headline. "Total NPC pool" and
    // "Buildable (current desired)" rows were removed — the optimal-split
    // max is the only number the user wanted visible here.
    canBuildEl.innerHTML = `
      <div class="_r-buildinfo">
        <div class="_r-buildinfo-row">
          <span>Max buildable (optimal split)</span>
          <span class="_r-buildinfo-val _r-highlight">${NPC.Utils.formatNumber(maxTheoretical)}</span>
        </div>
      </div>
    `;
  },

  _setMaxTroops() {
    const troop = this._troop;
    if (!troop) return;

    const npcData = NPC.ResourceParser.parseNPCDialog();
    const totalPool = npcData.total;
    const totalCostPerUnit = troop.cost.reduce((a, b) => a + b, 0);
    const max =
      totalCostPerUnit > 0 ? Math.floor(totalPool / totalCostPerUnit) : 0;

    document.querySelector("#_r-build-count").value = max;
    this._updatePreview();
  },

  _updatePreview() {
    const troop = this._troop;
    if (!troop) return;

    const count =
      parseInt(document.querySelector("#_r-build-count").value) || 0;
    const previewEl = document.querySelector("#_r-resource-preview");

    if (count <= 0) {
      previewEl.style.display = "none";
      return;
    }

    const npcData = NPC.ResourceParser.parseNPCDialog();
    const totalPool = npcData.total;
    const cost = troop.cost.map((c) => c * count);
    const totalCost = cost.reduce((a, b) => a + b, 0);
    const canAfford = totalCost <= totalPool;

    previewEl.style.display = "";

    let html = `
            <div class="_r-preview-header">
                <span>${NPC.Utils.formatNumber(count)}\u00d7 ${NPC.Utils.unitIcon(troop.unit)} ${troop.name}</span>
                <span class="_r-preview-total ${canAfford ? "_r-ok" : "_r-warn"}">
                    ${NPC.Utils.formatNumber(totalCost)} / ${NPC.Utils.formatNumber(totalPool)}
                </span>
            </div>
            <div class="_r-preview-grid">
        `;

    for (let i = 0; i < 4; i++) {
      html += `
                <div class="_r-preview-row">
                    <span class="_r-preview-icon">${NPC.RESOURCE_ICONS[i]}</span>
                    <span class="_r-preview-name">${NPC.RESOURCE_NAMES[i]}</span>
                    <span class="_r-preview-need">${cost[i]}</span>
                    <button type="button" class="_r-copy-btn" data-val="${cost[i]}" title="Copy">&#x2398;</button>
                </div>
            `;
    }
    html += `</div>`;
    // Two equal-width actions: Send to Indicator (persist the deficit for
    // the floating pull indicator) and Pull (open Travian's native in-place
    // hero transfer dialog with the same deficit pre-filled). flex:1 1 0 on
    // both buttons keeps them exactly half-width regardless of label length.
    html += `<div class="_r-action-row" style="display:flex;gap:6px;margin-top:8px;">`;
    html += `<button type="button" id="_r-send-indicator" class="_r-btn _r-btn-primary" style="flex:1 1 0;min-width:0;">&#x2192; Send to Indicator</button>`;
    html += `<button type="button" id="_r-pull-hero" class="_r-btn _r-btn-primary" style="flex:1 1 0;min-width:0;">&#x2913; Pull from Hero</button>`;
    html += `</div>`;

    previewEl.innerHTML = html;

    previewEl.querySelectorAll("._r-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(btn.dataset.val).then(() => {
          const orig = btn.textContent;
          btn.textContent = "\u2713";
          btn.classList.add("_r-copy-ok");
          setTimeout(() => {
            btn.textContent = orig;
            btn.classList.remove("_r-copy-ok");
          }, 900);
        });
      });
    });

    // Build-outright deficit per resource: how much MORE of each resource
    // the village needs to construct the requested unit count without doing
    // any NPC trading. Reads stock straight from the top-bar amounts
    // (#l1..#l4) — those reflect the actual village warehouse and are
    // independent of whatever the NPC dialog's #org cells might show. The
    // NPC-divided alternative (totalDeficit / 4) is the wrong number here
    // because it assumes a follow-up gold NPC trade; we want enough per
    // resource to recruit immediately.
    const computeDeficitAmounts = () => {
      const troop = this._troop;
      if (!troop) return null;
      const buildCount =
        parseInt(document.querySelector("#_r-build-count").value) || 0;
      if (buildCount <= 0) return null;
      const cost = troop.cost.map((c) => c * buildCount);
      const stock = NPC.ResourceParser.getVillageStock();
      return cost.map((c, i) => Math.max(0, c - (stock[i] || 0)));
    };

    const sendBtn = previewEl.querySelector("#_r-send-indicator");
    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        const amounts = computeDeficitAmounts();
        if (!amounts) return;
        const village = NPC.PullDialogObserver._getCurrentVillageInfo();
        NPC.PullDialogObserver.saveNeededAmounts(amounts, village);
        const origHTML = sendBtn.innerHTML;
        sendBtn.textContent = "\u2713 Saved";
        sendBtn.classList.add("_r-send-ok");
        sendBtn.disabled = true;
        setTimeout(() => {
          sendBtn.innerHTML = origHTML;
          sendBtn.classList.remove("_r-send-ok");
          sendBtn.disabled = false;
        }, 1500);
      });
    }

    // Pull button: opens Travian's native in-place hero transfer dialog
    // pre-filled to bring village stock up to the full cost. The native API's
    // `targetResourceAmount` is a THRESHOLD — Travian computes
    // max(0, target - villageStock) itself and pre-fills the popup with that.
    // So we pass the FULL COST (not the pre-computed deficit) for the native
    // path; otherwise Travian subtracts village stock twice and the popup
    // opens empty. The legacy /hero/inventory fallback fills inputs directly
    // from the saved amounts, so it still receives the deficit.
    const pullBtn = previewEl.querySelector("#_r-pull-hero");
    if (pullBtn) {
      pullBtn.addEventListener("click", () => {
        const troop = this._troop;
        if (!troop) return;
        const buildCount =
          parseInt(document.querySelector("#_r-build-count").value) || 0;
        if (buildCount <= 0) return;
        const cost = troop.cost.map((c) => c * buildCount);
        const deficit = computeDeficitAmounts();
        if (!deficit) return;
        NPC.HeroPuller.requestPull(deficit, "exact", null, {
          targetThreshold: cost,
        });
      });
    }
  },
};
