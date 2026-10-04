/** Read the page the player opened; relay measurements and alarm audio. */
"use strict";
(() => {
	const { api, parsePage, serverOrigin } = TSP;
	const origin = serverOrigin(window.location.href);
	if (!origin) return;
	let observedAt = Math.min(Date.now(), performance.timeOrigin || Date.now());
	let measurementSignature = null;
	let alarmAudio = null,
		alarmRequested = false;

	// CP data only lives in the #culture_points table and in inline scripts that
	// embed culturalPointsOverview / culturePointsRank. Hand parsePage just those
	// instead of serializing the whole document on every page load.
	function cpSource() {
		const parts = [];
		const table = document.getElementById("culture_points");
		if (table) parts.push(table.outerHTML);
		for (const script of document.scripts) {
			if (script.src) continue;
			const code = script.textContent;
			if (
				code.includes("culturalPointsOverview") ||
				code.includes("culturePointsRank")
			)
				parts.push(`<script>${code}</script>`);
		}
		return parts.join("");
	}

	async function scanPage() {
		const html = cpSource();
		const scan = html && parsePage(html, origin, Date.now());
		if (!scan?.hasData) return { success: false, origin, freshCp: false };
		const signature = JSON.stringify([
			scan.totalCp,
			scan.actualDailyCp,
			scan.passiveAccel,
		]);
		if (measurementSignature !== null && measurementSignature !== signature)
			observedAt = Date.now();
		measurementSignature = signature;
		// Embedded JSON remains frozen until navigation/AJAX replaces it. Reading
		// it again is not a fresh measurement; the live timer has its own clock.
		scan.observedAt = observedAt;
		const response = await api.runtime.sendMessage({
			action: "SAVE_SCAN",
			url: origin,
			scan,
		});
		return {
			success: !!response?.success,
			origin,
			freshCp:
				Number.isFinite(scan.totalCp) && Date.now() - observedAt < 300000,
		};
	}
	function playAudio() {
		if (!alarmRequested) return;
		if (!alarmAudio) {
			alarmAudio = new Audio(api.runtime.getURL("alarm.mp3"));
			alarmAudio.loop = true;
		}
		alarmAudio.play().catch(() => {});
	}
	function stopAudio() {
		alarmRequested = false;
		if (alarmAudio) {
			alarmAudio.pause();
			alarmAudio.currentTime = 0;
		}
	}
	api.runtime.onMessage.addListener((request, _sender, respond) => {
		if (request?.action === "RESCAN") {
			scanPage().then(respond, () =>
				respond({ success: false, origin, freshCp: false }),
			);
			return true;
		}
		if (request?.action === "PLAY_ALARM") {
			alarmRequested = true;
			playAudio();
		}
		if (request?.action === "STOP_ALARM") stopAudio();
	});
	// Retry a blocked audio play after a real user gesture, only while requested.
	document.addEventListener("pointerdown", playAudio, { passive: true });
	document.addEventListener("keydown", playAudio);
	async function initialize() {
		try {
			await scanPage();
			const state = await api.runtime.sendMessage({
				action: "SYNC_ALARM",
				url: origin,
			});
			if (state?.play) {
				alarmRequested = true;
				playAudio();
			}
		} catch {
			/* The extension may have been reloaded while this tab was open. */
		}
	}
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", initialize, { once: true });
	else initialize();
	let rescanTimer;
	document.addEventListener("click", (event) => {
		if (
			event.target?.closest?.(
				".legendTabs .tab, .dataSwitchButtons .iconButton",
			)
		) {
			clearTimeout(rescanTimer);
			rescanTimer = setTimeout(() => scanPage().catch(() => {}), 700);
		}
	});
	window.addEventListener("pagehide", () => {
		clearTimeout(rescanTimer);
		stopAudio();
	});
})();
