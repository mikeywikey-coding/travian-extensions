/**
 * constants.js — Static data, storage keys, and shared state
 */

// Chrome/Firefox cross-browser shim
const browser = globalThis.browser ?? chrome; // eslint-disable-line no-undef

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================

const MAP_SIZE = 401;
const OASIS_BASE_DEF = 10;

// Scoped Storage Keys — varied prefixes to avoid a uniform pattern
const _host = window.location.hostname;
const STORAGE_KEY = "db_" + _host;
const SCAN_DATA_KEY = "sc_" + _host;
const SETTINGS_KEY = "cf_" + _host;
const TROOPS_KEY = "tp_" + _host;
const SMITHY_KEY = "sm_" + _host;
// Version 2 stores observed coordinates, not inferred viewport blocks.
const COVERAGE_KEY = "cv2_" + _host;
const HERO_SYNC_KEY = "hs_" + _host;
// { "x|y": "4:50" } — read by farmlist.js on the rally point farm list.
const BONUS_KEY = "ob_" + _host;

// defI = defense vs infantry, defC = defense vs cavalry (mounted hero counts as cavalry)
const ANIMAL_STATS = {
	31: { name: "Rat", defI: 25, defC: 20, xp: 1, res: 160 },
	32: { name: "Spider", defI: 35, defC: 40, xp: 1, res: 160 },
	33: { name: "Snake", defI: 40, defC: 60, xp: 1, res: 160 },
	34: { name: "Bat", defI: 66, defC: 50, xp: 1, res: 160 },
	35: { name: "Wild Boar", defI: 70, defC: 33, xp: 2, res: 320 },
	36: { name: "Wolf", defI: 80, defC: 70, xp: 2, res: 320 },
	37: { name: "Bear", defI: 140, defC: 200, xp: 3, res: 480 },
	38: { name: "Crocodile", defI: 380, defC: 240, xp: 3, res: 480 },
	39: { name: "Tiger", defI: 170, defC: 250, xp: 3, res: 480 },
	40: { name: "Elephant", defI: 440, defC: 520, xp: 5, res: 800 },
};

// Original stats for 3-tribe servers (Romans, Teutons, Gauls only)
const TROOP_DATA_ORIGINAL = {
	1: {
		name: "Romans",
		units: [
			{
				id: "u1",
				name: "Legionnaire",
				atk: 40,
				spd: 6,
				carry: 50,
				cost: [120, 100, 150, 30],
			},
			{
				id: "u2",
				name: "Praetorian",
				atk: 30,
				spd: 5,
				carry: 20,
				cost: [100, 130, 160, 70],
			},
			{
				id: "u3",
				name: "Imperian",
				atk: 70,
				spd: 7,
				carry: 50,
				cost: [150, 160, 210, 80],
			},
			{
				id: "u5",
				name: "EI",
				cav: true,
				atk: 120,
				spd: 14,
				carry: 100,
				cost: [550, 440, 320, 100],
			},
			{
				id: "u6",
				name: "EC",
				cav: true,
				atk: 180,
				spd: 10,
				carry: 70,
				cost: [550, 640, 800, 180],
			},
		],
	},
	2: {
		name: "Teutons",
		units: [
			{
				id: "u11",
				name: "Club",
				atk: 40,
				spd: 7,
				carry: 60,
				cost: [95, 75, 40, 40],
			},
			{
				id: "u12",
				name: "Spearman",
				atk: 10,
				spd: 7,
				carry: 40,
				cost: [145, 70, 85, 40],
			},
			{
				id: "u13",
				name: "Axeman",
				atk: 60,
				spd: 6,
				carry: 50,
				cost: [130, 120, 170, 70],
			},
			{
				id: "u15",
				name: "Paladin",
				cav: true,
				atk: 55,
				spd: 10,
				carry: 110,
				cost: [370, 270, 290, 75],
			},
			{
				id: "u16",
				name: "TK",
				cav: true,
				atk: 150,
				spd: 9,
				carry: 80,
				cost: [450, 515, 480, 80],
			},
		],
	},
	3: {
		name: "Gauls",
		units: [
			{
				id: "u21",
				name: "Phalanx",
				atk: 15,
				spd: 7,
				carry: 35,
				cost: [100, 130, 55, 30],
			},
			{
				id: "u22",
				name: "Swordsman",
				atk: 65,
				spd: 6,
				carry: 45,
				cost: [140, 150, 185, 60],
			},
			{
				id: "u24",
				name: "TT",
				cav: true,
				atk: 90,
				spd: 19,
				carry: 75,
				cost: [350, 450, 230, 60],
			},
			{
				id: "u25",
				name: "Druidrider",
				cav: true,
				atk: 45,
				spd: 16,
				carry: 35,
				cost: [360, 330, 280, 120],
			},
			{
				id: "u26",
				name: "Haeduan",
				cav: true,
				atk: 140,
				spd: 13,
				carry: 65,
				cost: [500, 620, 675, 170],
			},
		],
	},
};

// Rebalanced stats for 5/6-tribe servers (Community Week balance)
// Only tribes 1-3 differ; tribes 6/7/8 only exist on these servers
const TROOP_DATA_REBALANCED = {
	1: {
		name: "Romans",
		units: [
			{
				id: "u1",
				name: "Legionnaire",
				atk: 50,
				spd: 7,
				carry: 50,
				cost: [120, 100, 150, 30],
			},
			{
				id: "u2",
				name: "Praetorian",
				atk: 30,
				spd: 6,
				carry: 20,
				cost: [100, 130, 160, 70],
			},
			{
				id: "u3",
				name: "Imperian",
				atk: 75,
				spd: 7,
				carry: 50,
				cost: [150, 160, 210, 80],
			},
			{
				id: "u5",
				name: "EI",
				cav: true,
				atk: 130,
				spd: 15,
				carry: 100,
				cost: [550, 440, 320, 100],
			},
			{
				id: "u6",
				name: "EC",
				cav: true,
				atk: 195,
				spd: 10,
				carry: 70,
				cost: [550, 640, 800, 180],
			},
		],
	},
	2: {
		name: "Teutons",
		units: [
			{
				id: "u11",
				name: "Club",
				atk: 40,
				spd: 7,
				carry: 60,
				cost: [95, 75, 40, 40],
			},
			{
				id: "u12",
				name: "Spearman",
				atk: 10,
				spd: 7,
				carry: 40,
				cost: [145, 70, 85, 40],
			},
			{
				id: "u13",
				name: "Axeman",
				atk: 65,
				spd: 7,
				carry: 50,
				cost: [130, 120, 170, 70],
			},
			{
				id: "u15",
				name: "Paladin",
				cav: true,
				atk: 90,
				spd: 14,
				carry: 110,
				cost: [370, 270, 290, 75],
			},
			{
				id: "u16",
				name: "TK",
				cav: true,
				atk: 150,
				spd: 12,
				carry: 80,
				cost: [450, 515, 480, 80],
			},
		],
	},
	3: {
		name: "Gauls",
		units: [
			{
				id: "u21",
				name: "Phalanx",
				atk: 15,
				spd: 7,
				carry: 35,
				cost: [100, 130, 55, 30],
			},
			{
				id: "u22",
				name: "Swordsman",
				atk: 70,
				spd: 7,
				carry: 45,
				cost: [140, 150, 185, 60],
			},
			{
				id: "u24",
				name: "TT",
				cav: true,
				atk: 110,
				spd: 19,
				carry: 75,
				cost: [350, 450, 230, 60],
			},
			{
				id: "u25",
				name: "Druidrider",
				cav: true,
				atk: 45,
				spd: 16,
				carry: 35,
				cost: [360, 330, 280, 120],
			},
			{
				id: "u26",
				name: "Haeduan",
				cav: true,
				atk: 150,
				spd: 13,
				carry: 65,
				cost: [500, 620, 675, 170],
			},
		],
	},
	6: {
		name: "Egyptians",
		units: [
			{
				id: "u51",
				name: "Slave Militia",
				atk: 10,
				spd: 7,
				carry: 15,
				cost: [45, 60, 30, 15],
			},
			{
				id: "u52",
				name: "Ash Warden",
				atk: 30,
				spd: 6,
				carry: 45,
				cost: [115, 100, 145, 60],
			},
			{
				id: "u53",
				name: "Khopesh",
				atk: 65,
				spd: 7,
				carry: 45,
				cost: [170, 180, 220, 80],
			},
			{
				id: "u55",
				name: "Anhur",
				cav: true,
				atk: 50,
				spd: 15,
				carry: 50,
				cost: [360, 330, 280, 120],
			},
			{
				id: "u56",
				name: "Chariot",
				cav: true,
				atk: 110,
				spd: 10,
				carry: 70,
				cost: [450, 560, 610, 180],
			},
		],
	},
	7: {
		name: "Huns",
		units: [
			{
				id: "u61",
				name: "Mercenary",
				atk: 35,
				spd: 6,
				carry: 50,
				cost: [130, 80, 40, 40],
			},
			{
				id: "u62",
				name: "Bowman",
				atk: 50,
				spd: 6,
				carry: 30,
				cost: [140, 110, 60, 60],
			},
			{
				id: "u64",
				name: "Steppe",
				cav: true,
				atk: 120,
				spd: 16,
				carry: 75,
				cost: [290, 370, 190, 45],
			},
			{
				id: "u65",
				name: "Marksman",
				cav: true,
				atk: 110,
				spd: 15,
				carry: 105,
				cost: [320, 350, 330, 50],
			},
			{
				id: "u66",
				name: "Marauder",
				cav: true,
				atk: 180,
				spd: 14,
				carry: 80,
				cost: [450, 560, 610, 140],
			},
		],
	},
	8: {
		name: "Spartans",
		units: [
			{
				id: "u71",
				name: "Hoplite",
				atk: 50,
				spd: 6,
				carry: 60,
				cost: [110, 185, 110, 35],
			},
			{
				id: "u73",
				name: "Shieldsman",
				atk: 40,
				spd: 8,
				carry: 40,
				cost: [145, 95, 245, 45],
			},
			{
				id: "u74",
				name: "Twinsteel",
				atk: 90,
				spd: 6,
				carry: 50,
				cost: [130, 200, 400, 65],
			},
			{
				id: "u75",
				name: "Elpida",
				cav: true,
				atk: 55,
				spd: 16,
				carry: 110,
				cost: [555, 445, 330, 110],
			},
			{
				id: "u76",
				name: "Crusher",
				cav: true,
				atk: 195,
				spd: 9,
				carry: 80,
				cost: [660, 495, 995, 170],
			},
		],
	},
};

// Active troop data — set by detectServerType() on load
let TROOP_DATA = TROOP_DATA_REBALANCED; // default to rebalanced (most common)
let detectedServerType = null; // "3-tribe" | "5-tribe" | "6-tribe"

// ==========================================
// RISK-ADJUSTED SCORING
// ==========================================

const RISK_STEEPNESS = 2.5;

// Safety margin (HP %) kept in reserve so estimation error can't kill the hero
const HERO_HP_BUFFER = 7;

function getRiskThresholds(level) {
	const levels = {
		1: { hp: 15, loss: 0.095, label: "Safe" },
		2: { hp: 25, loss: 0.18, label: "Cautious" },
		3: { hp: 35, loss: 0.25, label: "Balanced" },
		4: { hp: 50, loss: 0.35, label: "Aggressive" },
		5: { hp: 70, loss: 0.6, label: "Reckless" },
	};
	return levels[level] || levels[3];
}

// Global state
let resultsMap = new Map();
let knownOases = new Set();
// Bonuses already queued for saving this session ("x|y" → "4:50").
let oasisBonuses = new Map();
let scannedKeys = new Set();
let sessionScannedOases = new Set();
// Tombstones prevent async storage restoration from resurrecting cleared targets.
let resolvedOases = new Set();
let skippedOases = [];
// Unit ids the user has toggled off in the Troops tab — excluded from all
// troop calculations and the preview unit pool. Persisted in settings.
let disabledUnits = new Set();
