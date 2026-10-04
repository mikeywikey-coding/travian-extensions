// Skip Ads (ex-TravianSkipAds, by DUDSS).
//
// 2026-08 update: Travian moved the video-feature player. It used to be a
// third-party ad iframe (media.oadts.com/.../afv.php) that we had to reach
// into; today gpack main.js loads https://video.traviangames.com/v1/video.js
// into the MAIN page and calls
//   Traviangames.video.playInPageAd({ htmlVideoDivId: 'videoArea' })
// which renders the <video> straight into `#videoArea` inside the
// `#videoFeature` dialog. The SDK's fallback player listens for the video's
// own `ended` event, then POSTs /fallback/v1/reward and fires onRewarded,
// which Travian turns into `videofeature/ends`. So seeking the in-page
// <video> to its end is what completes the ad now.
//
// We therefore run in the main page: watch for a <video> appearing in
// `#videoArea` (or anywhere in the `#videoFeature` dialog), mute it, and once
// it has played past minPlaytime, seek past the end so the player's own
// `ended` handler runs. The legacy media.oadts.com iframe path is kept for
// servers/consent setups still serving the old player.
//
// Settings are stored in chrome.storage.local under namespaced `skipAds.*`
// keys (not the legacy unprefixed `enabled`/`debug`/etc. names, which
// were too generic to share with other features).
//
// Compliance note: we only mute and fast-forward the ad video element that
// the game itself opened after the user clicked "Watch video". No game
// endpoint is called by this feature — the reward request is still made by
// Travian's own player code, in response to its own `ended` event.
(function () {
	const STORAGE_KEYS = [
		'skipAds.debug',
		'skipAds.minPlaytime',
		'skipAds.videoLookupPollRate',
		'skipAds.videoSkipPollRate',
	];
	const DEFAULTS = {
		'skipAds.debug': false,
		'skipAds.minPlaytime': 0.4,
		'skipAds.videoLookupPollRate': 50,
		'skipAds.videoSkipPollRate': 300,
	};

	// Where the in-page player renders. `#videoArea` is the div id main.js
	// hands to playInPageAd(); the dialog around it is `#videoFeature`.
	const AD_CONTAINER_SELECTOR = '#videoArea, #videoFeature';

	let observer = null;
	let skipTimer = null;
	let settings = { ...DEFAULTS };

	function debug() {
		return !!settings['skipAds.debug'];
	}

	function trace(...args) {
		if (debug()) console.log('TravianQoL/skip-ads:', ...args);
	}

	const url = window.location.href;
	const IN_AD_IFRAME =
		window.top !== window.self &&
		url.includes('media.oadts.com') &&
		url.includes('delivery') &&
		url.includes('afv.php');

	// Is there an ad to handle right now? Two O(1) id lookups on game pages.
	function adOpen() {
		if (IN_AD_IFRAME) return !!document.querySelector('video');
		return !!(document.getElementById('videoArea') || document.getElementById('videoFeature'));
	}

	function muteEl(v) {
		v.muted = true;
		v.volume = 0;
	}

	// Videos we care about: inside the ad container (main page), or any video
	// at all when we're running inside the legacy ad iframe.
	function adVideos() {
		if (IN_AD_IFRAME) return Array.from(document.querySelectorAll('video'));
		const containers = document.querySelectorAll(AD_CONTAINER_SELECTOR);
		const out = [];
		containers.forEach((c) => c.querySelectorAll('video').forEach((v) => out.push(v)));
		return out;
	}

	function isNumber(n) {
		return typeof n === 'number' && !isNaN(n) && isFinite(n);
	}

	function skipCycle() {
		const videos = adVideos();
		for (const video of videos) {
			muteEl(video);
			const src = video.currentSrc || video.src || '';
			if (src.includes('blank.mp4')) {
				trace('blank video, not skipping');
				continue;
			}
			if (!isNumber(video.duration) || !isNumber(video.currentTime)) {
				trace('duration/currentTime not ready', video.duration, video.currentTime);
				continue;
			}
			if (video.currentTime >= video.duration) {
				trace('already at end');
				continue;
			}
			if (video.currentTime <= settings['skipAds.minPlaytime']) {
				trace('too soon to skip', video.currentTime);
				continue;
			}
			trace('skipping to end', video.duration);
			// Seeking past the end makes the player emit `ended`, which is what
			// its reward handler is waiting for.
			video.currentTime = video.duration + 1;
		}
		// Keep polling only while the ad is up; the observer restarts it.
		skipTimer = adOpen() ? setTimeout(skipCycle, settings['skipAds.videoSkipPollRate']) : null;
	}

	// On every DOM change: if the ad is open, mute its videos at once (before
	// they can play a frame of audio — the poll is too slow for that alone)
	// and make sure the skip poll is running. Otherwise nothing runs.
	function check() {
		if (!adOpen()) return;
		adVideos().forEach(muteEl);
		if (!skipTimer) skipCycle();
	}

	function startWatching() {
		observer = new MutationObserver(check);
		observer.observe(document.documentElement, { childList: true, subtree: true });
		check();
	}

	window.TravianQoL.register({
		id: 'skip-ads',
		label: 'Skip builder-bonus ads',
		description:
			'Auto-mutes and skips the Travian video-feature ad (adventure bonus, builder bonus, daily quest). Originally by DUDSS. Settings live in the "Skip Ads" tab.',
		init() {
			chrome.storage.local.get(STORAGE_KEYS, (data) => {
				settings = { ...DEFAULTS, ...data };
				startWatching();
			});
		},
		destroy() {
			if (observer) {
				observer.disconnect();
				observer = null;
			}
			if (skipTimer) {
				clearTimeout(skipTimer);
				skipTimer = null;
			}
		},
	});
})();
