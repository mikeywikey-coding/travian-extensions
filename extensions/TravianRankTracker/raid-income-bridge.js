/* global chrome */
/**
 * Publishes Rank Tracker's recent raid-income average to the current Travian
 * origin. Other installed helpers can read this passive summary without access
 * to Rank Tracker's private extension storage.
 */
var RankTrackerRaidIncome = {
	hourlyAverage(history) {
		if (!Array.isArray(history) || history.length < 2) return null;

		let gained = 0;
		let elapsedHours = 0;
		const samples = history.filter((point) => Number.isFinite(point?.timestamp) &&
			Number.isFinite(point.valBounty) && point.valBounty >= 0)
			.sort((a, b) => a.timestamp - b.timestamp);
		for (let i = 1; i < samples.length; i++) {
			const previous = samples[i - 1];
			const current = samples[i];
			const hours = (current.timestamp - previous.timestamp) / 3_600_000;
			const increase = current.valBounty < previous.valBounty
				? current.valBounty : current.valBounty - previous.valBounty;
			if (!(hours > 0)) continue;
			gained += increase;
			elapsedHours += hours;
		}
		return elapsedHours > 0 ? gained / elapsedHours : null;
	},
};

// Runs on every page load, so it reads only the small cached summary. The
// full history (up to 2000 snapshots) is read just once after each history
// write, which clears the summary (see storeHistory in utils.js).
(async function publishRaidIncome() {
	const summaryKey = `raidIncome_${location.origin}`;
	const pageKey = "_rt_ri";

	let summary = (await chrome.storage.local.get(summaryKey))[summaryKey];
	if (!summary || !Number.isFinite(summary.updatedAt)) {
		const historyKey = `history_${location.origin}`;
		const history = (await chrome.storage.local.get(historyKey))[historyKey];
		summary = {
			perHour: RankTrackerRaidIncome.hourlyAverage(history),
			updatedAt: (Array.isArray(history) ? history : []).reduce((latest, point) =>
				Number.isFinite(point?.timestamp) && Number.isFinite(point.valBounty)
					? Math.max(latest, point.timestamp) : latest, 0),
		};
		await chrome.storage.local.set({ [summaryKey]: summary });
	}
	if (!Number.isFinite(summary.perHour) || summary.perHour < 0) {
		localStorage.removeItem(pageKey);
		return;
	}
	localStorage.setItem(
		pageKey,
		JSON.stringify({ perHour: summary.perHour, updatedAt: summary.updatedAt }),
	);
})();
