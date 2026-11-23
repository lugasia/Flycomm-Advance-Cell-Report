/* Shared tool switcher for every page in the Analysis Suite.
 *
 * One place lists the tools. Each page only needs
 *     <div class="tool-switcher"></div>   +   <script src="suite-nav.js" defer></script>
 * and gets the same compact control: the current tool's name, and a menu of
 * all the others grouped by what they are for. Add a tool here and it shows
 * up everywhere.
 */
(function () {
  var TOOLS = [
    { group: 'Investigate' },
    { href: 'sql-builder.html',     icon: 'radar',           name: 'SIGINT',         desc: 'Query the cells inside an area you draw' },
    { href: 'network_map.html',     icon: 'cell_tower',      name: 'Signal Map',     desc: 'Where each network is received, with anomalies flagged' },
    { href: 'network-graph.html',   icon: 'hub',             name: 'Network Graph',  desc: 'Sites, cells and how devices move between them' },
    { href: 'cell-footprint.html',  icon: 'hexagon',         name: 'Cell Footprint', desc: 'Coverage of a single cell' },
    { href: 'gnss-spoofing.html',   icon: 'gps_off',         name: 'GNSS Spoofing',  desc: 'Devices reporting a position their cell cannot serve' },
    { group: 'Monitor' },
    { href: 'db-dashboard.html',        icon: 'insights',        name: 'DB Dashboard', desc: 'Live KPIs of the measurements table' },
    { href: 'regulator-dashboard.html', icon: 'account_balance', name: 'Regulator',    desc: 'Country-level users and operators' },
    { href: 'roaming.html',             icon: 'flight_takeoff',  name: 'Roaming SLA',  desc: 'Service quality roaming subscribers get' },
    { group: 'Files' },
    { href: 'nmf-viewer.html',      icon: 'route',           name: 'NMF Viewer',     desc: 'Drive-test files on a map' }
  ];

  var CSS =
    '.suite-nav{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #1e3a5f;background:#0a1628;flex-shrink:0;font-family:Inter,system-ui,sans-serif}' +
    '.suite-nav .sn-btn{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px solid #1e3a5f;background:#162038;color:#e2e8f0;font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer;text-align:left;transition:border-color .15s}' +
    '.suite-nav .sn-btn:hover,.suite-nav .sn-btn.open{border-color:#3b82f6}' +
    '.suite-nav .sn-btn .material-icons{font-size:17px;color:#60a5fa}' +
    '.suite-nav .sn-btn .sn-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.suite-nav .sn-btn .sn-chev{color:#64748b;font-size:18px}' +
    '.suite-nav .sn-home{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:7px;border:1px solid #1e3a5f;color:#94a3b8;text-decoration:none;flex-shrink:0}' +
    '.suite-nav .sn-home:hover{border-color:#3b82f6;color:#e2e8f0}' +
    '.suite-nav .sn-home .material-icons{font-size:18px}' +
    '.sn-menu{position:fixed;z-index:10000;display:none;width:300px;max-height:calc(100vh - 24px);overflow-y:auto;padding:6px;background:#162038;border:1px solid #1e3a5f;border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}' +
    '.sn-menu.open{display:block}' +
    '.sn-menu .sn-group{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding:9px 10px 4px}' +
    '.sn-menu a{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:7px;text-decoration:none;color:#e2e8f0}' +
    '.sn-menu a:hover{background:rgba(59,130,246,.1)}' +
    '.sn-menu a.current{background:rgba(59,130,246,.16)}' +
    '.sn-menu a .material-icons{font-size:18px;color:#60a5fa;margin-top:1px}' +
    '.sn-menu a b{display:block;font-size:12.5px;font-weight:600}' +
    '.sn-menu a span.sn-desc{display:block;font-size:11px;color:#94a3b8;line-height:1.4;margin-top:1px}';

  function init() {
    var hosts = document.querySelectorAll('.tool-switcher');
    if (!hosts.length) return;

    if (!document.querySelector('link[href*="Material+Icons"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
      document.head.appendChild(l);
    }
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var current = TOOLS.filter(function (t) { return t.href && t.href.toLowerCase() === here; })[0];

    var menu = document.createElement('div');
    menu.className = 'sn-menu';
    menu.innerHTML = TOOLS.map(function (t) {
      if (t.group) return '<div class="sn-group">' + t.group + '</div>';
      return '<a href="' + t.href + '"' + (t === current ? ' class="current"' : '') + '>' +
        '<span class="material-icons">' + t.icon + '</span>' +
        '<span><b>' + t.name + '</b><span class="sn-desc">' + t.desc + '</span></span></a>';
    }).join('');
    document.body.appendChild(menu);

    var openBtn = null;
    function close() { menu.classList.remove('open'); if (openBtn) openBtn.classList.remove('open'); openBtn = null; }

    hosts.forEach(function (host) {
      host.className = 'suite-nav';
      host.innerHTML =
        '<button type="button" class="sn-btn" title="Switch tool">' +
          '<span class="material-icons">' + (current ? current.icon : 'apps') + '</span>' +
          '<span class="sn-name">' + (current ? current.name : 'Analysis Suite') + '</span>' +
          '<span class="material-icons sn-chev">unfold_more</span>' +
        '</button>' +
        '<a class="sn-home" href="index.html" title="All tools"><span class="material-icons">apps</span></a>';
      var btn = host.querySelector('.sn-btn');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (openBtn === btn) { close(); return; }
        close();
        var r = btn.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 308)) + 'px';
        menu.style.top = (r.bottom + 6) + 'px';
        menu.classList.add('open'); btn.classList.add('open'); openBtn = btn;
      });
    });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', close);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
