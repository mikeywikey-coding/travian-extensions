/** Audio owner: attack cues are one-shot events; ordinary alarms repeat. */
const audioCache = new Map();
const consumed = new Map();
let activeIds = new Set();
let pending = [];
let current = null;
let normalEnabled = false;
let normalCooldownUntil = 0;
let wakeTimer = null;
let volume = 0.8;

function valid(event) {
  return activeIds.has(event.id) && event.expiresAt > Date.now();
}

function halt() {
  clearTimeout(wakeTimer);
  wakeTimer = null;
  if (current) {
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.currentTime = 0;
    current = null;
  }
}

function play(type, events = []) {
  const file = type === "attack" ? "attack.mp3" : "alarm.mp3";
  if (!audioCache.has(file)) audioCache.set(file, new Audio(chrome.runtime.getURL(file)));
  const audio = audioCache.get(file);
  const playing = { audio, type, events };
  current = playing;
  audio.loop = false;
  audio.volume = volume;
  audio.currentTime = 0;
  audio.onended = () => {
    if (current !== playing) return;
    current = null;
    if (type === "normal") normalCooldownUntil = Date.now() + 3000;
    pump();
  };
  const failed = () => {
    if (current !== playing) return;
    halt();
    // Do not spin or replay an attack on an audio failure. The next normal
    // alarm update can retry ordinary audio; attack cards remain visible.
    console.warn("TravAlarm could not play", file);
  };
  audio.onerror = failed;
  audio.play().catch(failed);
}

function pump() {
  clearTimeout(wakeTimer);
  wakeTimer = null;
  const now = Date.now();
  for (const [id, expiry] of consumed) if (expiry <= now) consumed.delete(id);
  pending = pending.map(batch => batch.filter(valid)).filter(batch => batch.length);
  if (current?.type === "attack") {
    current.events = current.events.filter(valid);
    if (!current.events.length) halt();
  }
  if (current?.type === "normal" && (!normalEnabled || pending.length)) halt();
  if (!current && pending.length) play("attack", pending.shift());
  if (!current && normalEnabled && now >= normalCooldownUntil) play("normal");
  if (current?.type === "attack") {
    const nextExpiry = Math.min(...current.events.map(event => event.expiresAt));
    wakeTimer = setTimeout(pump, Math.max(1, nextExpiry - now));
  } else if (!current && normalEnabled) {
    wakeTimer = setTimeout(pump, Math.max(1, normalCooldownUntil - now));
  }
}

function setVolume(pct) {
  if (!Number.isFinite(pct)) return;
  volume = Math.pow(Math.max(0, Math.min(1, pct / 100)), 4);
  for (const audio of audioCache.values()) audio.volume = volume;
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === "SYNC_SOUND") {
    setVolume(msg.volume ?? 80);
    normalEnabled = !!msg.normal;
    activeIds = new Set(msg.activeAttackIds || []);
    const fresh = [];
    for (const event of msg.attackEvents || []) {
      if (!valid(event) || consumed.has(event.id)) continue;
      consumed.set(event.id, event.expiresAt);
      fresh.push(event);
    }
    if (fresh.length) pending.push(fresh);
    pump();
  } else if (msg.type === "STOP_SOUND") {
    pending = [];
    normalEnabled = false;
    halt();
  } else if (msg.type === "SET_VOLUME") {
    setVolume(msg.volume ?? 80);
  }
});
