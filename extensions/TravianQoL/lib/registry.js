// Feature registry — every QoL module pushes itself in here on script load.
// A feature is { id, label, description, init(), destroy() }.
// `init` is called once when the feature is enabled; `destroy` (optional) is
// called if the feature gets toggled off live. Modules must be idempotent —
// init() may be called again after destroy().
window.TravianQoL = window.TravianQoL || {};
window.TravianQoL.features = window.TravianQoL.features || [];

window.TravianQoL.register = function register(feature) {
	if (!feature || !feature.id || typeof feature.init !== 'function') {
		console.warn('[TravianQoL] ignoring malformed feature', feature);
		return;
	}
	// Guard against double-registration if the content script runs twice.
	if (window.TravianQoL.features.some((f) => f.id === feature.id)) return;
	window.TravianQoL.features.push(feature);
};

// Storage key used by both the loader and the options page.
window.TravianQoL.STORAGE_KEY = 'travianQoL.enabled';
