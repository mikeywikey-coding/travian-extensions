/**
 * main.js — Entry point: initialise the panel when on the map page
 */
if (location.pathname.includes("karte.php")) {
  setTimeout(
    () => {
      applyServerTroopData();
      _loadCoverage();
      createUI();
    },
    Math.round(800 * (0.7 + Math.random() * 0.8)),
  );
}
