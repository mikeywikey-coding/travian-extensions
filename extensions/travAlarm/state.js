/**
 * TRAVIAN WATCHMAN PRO - STATE & CONFIGURATION
 */

/* global browser, chrome */

// Universal API shim (browser for Firefox, chrome for Chrome/MV3)
const api = typeof browser !== "undefined" ? browser : chrome;

// ==========================================
// CONFIGURATION & STATE
// ==========================================
let silencedAlarms = new Set();
let currentAlarms = [];

const uiRefs = new Map();
const firstSeenTimes = new Map(); // uid → Date.now() when first encountered (for progress bars)
const collapsedSections = new Set(); // section type keys that are manually collapsed
const expandedSections = new Set(); // section type keys that are manually expanded

let lastRallyFetchTime = 0;
let isFetchingRally = false;
let tooltipEl = null;

let globalVillageMap = {};

// village name → color slot index (persisted via _tw_vc) for the village dots
const villageColorSlots = new Map();

// Fetch throttle state — isFetching + lastTime per data source
const fetchState = {
  prod: { isFetching: false, lastTime: 0 },
  training: { isFetching: false, lastTime: 0 },
  warehouse: { isFetching: false, lastTime: 0 },
  celebrations: { isFetching: false, lastTime: 0 },
  attackCheck: { isFetching: false, lastTime: 0 },
  hero: { isFetching: false, lastTime: 0 },
};

let _firedResourceAlarms = new Set();

// ==========================================
// SERVER TAG GENERATION
// ==========================================
const generateServerTag = () => {
  const host = window.location.hostname
    .replace(/^www\./, "")
    .replace(/\.travian\.[a-z]+$/, "");

  const regionShorteners = {
    europe: "eur",
    america: "ame",
    arabia: "ara",
    international: "int",
    hispano: "esp",
    nordic: "nor",
    balkans: "blk",
    asia: "asi",
    com: "",
  };

  const parts = host
    .split(".")
    .map((part) => regionShorteners[part] ?? part)
    .filter((p) => p !== "");

  return `[${parts.join(".")}]`;
};

const serverTag = generateServerTag();

const DEFAULT_SHORTCUTS = [
  { label: "10m", minutes: 10 },
  { label: "15m", minutes: 15 },
  { label: "20m", minutes: 20 },
  { label: "30m", minutes: 30 },
];

const cleanText = (str) => str.replace(/\s+/g, " ").trim();
const cleanCoords = (str) => str.replace(/[^\d|−-]/g, "").replace("−", "-");

