/**
 * Travian NPC Resource Helper v3.1 - Entry Point
 * Initializes all modules.
 */
/* global NPC */

(function () {
	"use strict";

	function init() {
		// Server type is resolved when the NPC panel opens; dorf1 is the page
		// that reliably carries the tribe list, so refresh the cache there.
		if (location.pathname.includes("dorf1")) NPC.detectServerType();
		NPC.HeroPageObserver.init();
		NPC.HeroPuller.init();
		NPC.TransferDialogObserver.start();
		NPC.NPCObserver.start();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
