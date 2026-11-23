/* Shared dark basemap for every map in the Analysis Suite.
 *
 * CARTO now stamps "API KEY REQUIRED" across every tile served from the
 * public {s}.basemaps.cartocdn.com endpoint, so the default basemap here is
 * keyless OpenStreetMap raster darkened in CSS (grayscale + invert), which
 * lands very close to the old dark_all look and goes to z19.
 *
 * To go back to real CARTO tiles, get a free key at carto.com/basemaps/apikey
 * and either set window.CARTO_API_KEY before this script runs, or run
 * setCartoApiKey('...') once in the console (stored in localStorage).
 *
 * Usage:  addDarkBasemap(map, { maxZoom: 20 })   ->  returns the L.TileLayer
 */
(function () {
  var STYLE_ID = 'basemap-dark-style';
  var LS_KEY = 'carto_api_key';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    // Leaflet puts `className` on the layer container div, so target the tiles
    // inside it: that way the filter composes with (instead of overriding) any
    // per-page .leaflet-tile-pane / .map-tiles brightness rule.
    el.textContent = '.basemap-dark .leaflet-tile{filter:grayscale(1) invert(1) brightness(.75) contrast(1.15);}';
    document.head.appendChild(el);
  }

  function storedKey() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }

  window.setCartoApiKey = function (key) {
    try { key ? localStorage.setItem(LS_KEY, key) : localStorage.removeItem(LS_KEY); } catch (e) {}
    return 'Reload the page to apply.';
  };

  window.addDarkBasemap = function (map, opts) {
    opts = opts || {};
    injectStyle();
    var key = window.CARTO_API_KEY || storedKey();
    var cls = opts.className || '';
    var layer;

    if (key) {
      layer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=' + encodeURIComponent(key), {
          subdomains: 'abcd',
          maxZoom: opts.maxZoom || 20,
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          className: cls
        });
    } else {
      layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: opts.maxZoom || 19,
        maxNativeZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        className: ('basemap-dark ' + cls).trim()
      });
    }
    return layer.addTo(map);
  };
})();
