/**
 * TRAVIAN WATCHMAN PRO - HELPER FUNCTIONS
 */

const CROP_OVERVIEW_LABEL = "Crop full in";

function parseSmartDuration(input) {
  if (!input) return null;
  let str = input.toString().trim();

  // Handle 12h clock: "10pm", "10:30pm", "10:30:15pm", "10am", "10:30am"
  const ampmMatch = str.match(
    /^(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(am|pm)$/i,
  );
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const seconds = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const period = ampmMatch[4].toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    const targetDate = new Date();
    targetDate.setHours(hours, minutes, seconds, 0);
    if (targetDate.getTime() <= Date.now())
      targetDate.setDate(targetDate.getDate() + 1);
    return targetDate.getTime() - Date.now();
  }

  if (str.includes(":") || str.includes(".")) {
    let parts = str
      .replace(/\./g, ":")
      .split(":")
      .map((n) => parseInt(n, 10) || 0);
    if (parts.length === 3)
      return parts[0] * 3600 * 1000 + parts[1] * 60 * 1000 + parts[2] * 1000;
    if (parts.length === 2) return parts[0] * 60 * 1000 + parts[1] * 1000;
  }

  const num = parseFloat(str);
  if (!isNaN(num)) return num * 60 * 1000;
  return null;
}

/**
 * Next future timestamp matching the time-of-day (H:M:S) of `anchorMs`.
 * Keeps "daily" alarms pinned to their set clock time when re-armed: returns
 * today's occurrence if it's still ahead, otherwise tomorrow's — so a daily
 * alarm always fires at the set time regardless of when it's reset.
 * @param {number} anchorMs - a timestamp whose time-of-day is the target
 * @param {number} [now=Date.now()] - reference "now"
 * @returns {number} epoch ms of the next occurrence
 */
function nextDailyOccurrence(anchorMs, now = Date.now()) {
  const anchor = new Date(anchorMs);
  const next = new Date(now);
  next.setHours(
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    0,
  );
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function formatDurationForPrompt(ms) {
  if (ms < 0) return "0";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  if (s === 0) return `${m}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateSmartBuildingName() {
  const possibleHeaders = [
    document.querySelector(".windowTitle"),
    document.querySelector("#content .titleInHeader"),
    document.querySelector("div.fluidHeading"),
    document.querySelector("h1"),
  ];
  const headerNode = possibleHeaders.find(
    (el) => el && el.innerText.trim().length > 0,
  );
  let rawName = headerNode ? headerNode.innerText.trim() : "";

  rawName = rawName.replace(/[\t\n]/g, "").trim();

  if (!rawName) return "Reinforcements in";

  if (rawName.toLowerCase().includes("overview")) {
    return CROP_OVERVIEW_LABEL;
  }

  const match = rawName.match(/^(.*?)\s(?:Level|Lvl|level)\s*(\d+)$/i);
  if (match) {
    const namePart = match[1].trim();
    const currentLevel = parseInt(match[2], 10);
    return `Queue ${namePart} Level ${currentLevel + 1}`;
  }

  return `Queue ${rawName}`;
}

function calculateDelayFromSmartText(text, node = null) {
  if (node && node.getAttribute("value")) {
    const seconds = parseInt(node.getAttribute("value"), 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }

  if (!text) return null;

  let clean = text
    .toLowerCase()
    .replace(/in/g, "")
    .replace(/hrs\.?/g, "")
    .replace(/min\.?/g, "")
    .replace(/sec\.?/g, "")
    .replace(/,/g, "")
    .trim();

  const hmsMatch = clean.match(/^(\d{1,2})[:.](\d{1,2})[:.](\d{1,2})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    return h * 3600 * 1000 + m * 60 * 1000 + s * 1000;
  }

  const timeMatch = clean.match(/(\d{1,2}):(\d{2})/);
  const dateMatch = clean.match(/(\d{1,2})\.(\d{2})/);

  if (timeMatch) {
    const now = new Date();
    let targetDate = new Date();

    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      targetDate.setFullYear(now.getFullYear(), month, day);
    }

    targetDate.setHours(
      parseInt(timeMatch[1], 10),
      parseInt(timeMatch[2], 10),
      0,
      0,
    );

    if (!dateMatch && targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (dateMatch && targetDate.getTime() < now.getTime() - 86400000) {
      targetDate.setFullYear(now.getFullYear() + 1);
    }

    return targetDate.getTime() - now.getTime();
  }

  return parseSmartDuration(clean);
}

/**
 * Strips bracket tags, leading emojis, and hero-icon spans from a raw alarm name.
 * @param {string} rawName
 * @returns {string}
 */
function cleanAlarmName(rawName) {
  let clean = rawName.replace(/\[[^\]]+\]/g, "").trim();
  clean = clean.replace(/\s{2,}/g, " ");
  clean = clean.replace(/^(?:⭐|⚔️|⚔|🎓|📦|🌾|🪵|🧱|🔩|🎉|🚨|⚠️|⚠)\s*/u, "");
  clean = clean.replace(/<span class="hero-icon">⚔️?<\/span>\s*/g, "");
  return clean.trim();
}

/**
 * Splits a cleaned alarm name into its primary label and village/context parts.
 * Handles both pipe-separated ("Name | Village") and parenthesised ("Name (Village) #n") formats.
 * @param {string} cleanName
 * @returns {{ primary: string, secondary: string, suffix: string }}
 */
function _splitAlarmLabel(cleanName) {
  if (cleanName.includes("|")) {
    const idx = cleanName.indexOf("|");
    return {
      primary: cleanName.substring(0, idx).trim(),
      secondary: cleanName.substring(idx + 1).trim(),
      suffix: "",
    };
  }
  const parts = cleanName.match(/^(.*?)(\s\(([^)]+)\))(\s#\d+)?$/);
  if (parts) {
    return {
      primary: (parts[1] + (parts[4] || "")).trim(),
      secondary: parts[3].trim(),
      suffix: parts[4] || "",
    };
  }
  return { primary: cleanName, secondary: "", suffix: "" };
}

/**
 * Decomposes a raw alarm name into structured parts for the card UI.
 * @param {string} rawName - The raw alarm name string
 * @param {boolean} isRecurring - Whether alarm is recurring
 * @returns {{ iconHtml: string, name: string, village: string, isRecurring: boolean }}
 */
function getStructuredName(rawName, isRecurring) {
  const iconHtml = getAlarmSvgIcon(rawName);
  const cleanName = cleanAlarmName(rawName);
  const { primary, secondary } = _splitAlarmLabel(cleanName);

  return {
    iconHtml,
    name: primary.replace(serverTag, "").trim(),
    village: secondary.replace(serverTag, "").trim(),
    isRecurring: !!isRecurring,
  };
}

/**
 * Returns a stable, well-separated hue (0-359) for a village's dot color.
 * Each village is assigned the lowest free slot on first sight and the
 * assignment is persisted, so a village keeps its color across sessions.
 * Slots map to hues via the golden angle, which keeps consecutive slots
 * far apart on the color wheel — hashing the name instead lets two
 * villages land on near-identical hues by chance.
 * @param {string} name - Village name
 * @returns {number}
 */
function villageHue(name) {
  let slot = villageColorSlots.get(name);
  if (slot == null) {
    const used = new Set(villageColorSlots.values());
    slot = 0;
    while (used.has(slot)) slot++;
    villageColorSlots.set(name, slot);
    api.storage.local
      .set({ _tw_vc: Object.fromEntries(villageColorSlots) })
      .catch(() => {});
  }
  return Math.round(slot * 137.508) % 360;
}

async function restoreVillageColors() {
  const res = await api.storage.local.get({ _tw_vc: null });
  if (res._tw_vc) {
    for (const [v, slot] of Object.entries(res._tw_vc)) {
      villageColorSlots.set(v, slot);
    }
  }
}

function getResourceValue(wrapper, typePrefix) {
  const icon = wrapper.querySelector(`.${typePrefix}, .${typePrefix}Big`);
  if (!icon) return 0;
  const valueSpan = icon.parentElement?.querySelector(".value");
  if (valueSpan) {
    return parseInt(valueSpan.innerText.replace(/\D/g, "") || "0");
  }
  return 0;
}
