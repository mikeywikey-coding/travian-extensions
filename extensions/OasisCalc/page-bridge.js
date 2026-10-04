/**
 * page-bridge.js — Runs in MAIN world (page context).
 * Intercepts Travian.api map/position responses via Proxy and forwards tile
 * data to the isolated content scripts via CustomEvent on document.
 */
(function () {
  const _td = "oasiscalc:map-data:v1";

  let _wrapped = false;

  function _tryWrap() {
    if (!window.Travian || typeof window.Travian.api !== "function") return false;
    if (_wrapped) return true;

    const _orig = Travian.api;
    const _origToStr = Function.prototype.toString.bind(_orig);

    const handler = {
      apply: function (target, thisArg, argsList) {
        const endpoint = argsList[0];
        const opts = argsList[1];
        if (
          typeof endpoint === "string" &&
          endpoint.indexOf("map/position") !== -1 &&
          opts &&
          typeof opts === "object"
        ) {
          // Clone opts shallowly so the original object is never mutated
          const wrapped = {};
          for (var k in opts) wrapped[k] = opts[k];
          const _origSuccess = wrapped.success || function () {};
          wrapped.success = function (data) {
            try {
              document.dispatchEvent(
                new CustomEvent(_td, { detail: JSON.stringify(data) }),
              );
            } catch (_) {}
            return _origSuccess.apply(this, arguments);
          };
          argsList = argsList.slice();
          argsList[1] = wrapped;
        }
        return target.apply(thisArg, argsList);
      },
      // Return original toString without adding own properties to the proxy
      get: function (target, prop, receiver) {
        if (prop === "toString" || prop === "toSource") {
          return _origToStr;
        }
        return Reflect.get(target, prop, receiver);
      },
    };

    const proxy = new Proxy(_orig, handler);
    Travian.api = proxy;
    _wrapped = true;
    return true;
  }

  // Use MutationObserver to detect when Travian.api becomes available
  // instead of setInterval polling
  if (!_tryWrap()) {
    var _obs = new MutationObserver(function () {
      if (_tryWrap()) _obs.disconnect();
    });
    _obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // Fallback timeout to clean up observer if Travian.api never appears
    setTimeout(function () {
      _obs.disconnect();
    }, 15000);
  }
})();
