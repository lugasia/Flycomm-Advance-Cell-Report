# Claude Code Prompt — Cell/Sector RSRP Footprint App

Build a new tool inside the **Analysis Suite** repo (this folder — *not* the FlyC2 repo). The tool takes an ECGI / Cell ID / eNB and renders the cell's real-world RSRP heatmap as an H3 hex grid, with no site markers — just the footprint.

A `cell-rsrp` query type already exists in `sql-builder.html` and generates SQL that returns rows. The new app reuses that idea but skips the raw-row return — instead, ClickHouse aggregates straight into H3 hexes and the frontend renders them as a coverage heatmap. Two artefacts: a new HTML page and one new backend endpoint.

---

## 1. Codebase context

You are working in `/Analysis Suite/`. Conventions to match:

- **Static HTML + Python proxy.** Pages are single-file HTML with embedded CSS/JS. The proxy is `clickhouse_proxy.py` (port 8000). New endpoints are added by extending `do_POST` and the `ProxyHandler` class.
- **Existing pages**: `sql-builder.html`, `db-dashboard.html`, `nmf-viewer.html`, `network_map.html`. Open `db-dashboard.html` first — it's the cleanest reference for sidebar + Leaflet layout.
- **Map**: Leaflet 1.9.4 from unpkg. Use CartoDB dark tiles with `filter: brightness(1.6) contrast(1.1) saturate(1.1)` (matches the rest of the suite).
- **Icons**: Material Icons from Google Fonts CDN.
- **Fonts**: `Inter` for UI, `JetBrains Mono` for code / numeric.
- **Sidebar width**: 480px, dark theme.

CSS variables to reuse (verbatim — copy from `db-dashboard.html`):

```css
--navy: #0a1628;  --card: #162038;  --card2: #1a2744;  --card-border: #1e3a5f;
--accent: #3b82f6;  --accent2: #60a5fa;  --red: #ef4444;  --orange: #f59e0b;
--green: #22c55e;  --cyan: #06b6d4;  --purple: #a78bfa;
--text: #e2e8f0;  --text-muted: #94a3b8;  --text-dim: #64748b;
```

Tool switcher (top of sidebar, present on `sql-builder.html`, `db-dashboard.html`, `nmf-viewer.html`): add this new page as a sibling entry. Bottom nav (`SIGINT | Workbench | Roaming | Dashboard`) stays as-is.

---

## 2. Files to create / modify

### New file: `cell-footprint.html`
Single-page HTML with embedded CSS + JS. Same skeleton as `db-dashboard.html`.

### Modify: `clickhouse_proxy.py`
Add one new endpoint: `POST /query/cell-footprint`. It is the only backend change.

### Modify: `sql-builder.html`, `db-dashboard.html`, `nmf-viewer.html`
Add `Cell Footprint` to the existing tool switcher (top of sidebar). Tiny edit — copy the existing pattern.

Do **not** modify any FlyC2 repo files. This work is self-contained in `/Analysis Suite/`.

---

## 3. Backend — `POST /query/cell-footprint`

### Request

```json
{
  "ecgis": ["234100548264703", "..."],          // canonical full global IDs
  "ecis": [8481, 8485],                         // optional; require PLMN if provided
  "enbs": [33, 542647],                         // optional; expand to ECIs server-side
  "plmn": "234-10",                             // required if ecis/enbs are supplied
  "hours": 720,                                  // time window, default 168 (7d)
  "h3_resolution": null,                         // null = auto; else 8..12
  "min_samples_per_hex": 3,
  "metric": "p50_rsrp",                          // p50_rsrp | avg_rsrp | max_rsrp | p75_rsrp
  "result_limit": 50000,
  "include_nsa_synthesized": true,               // see ClickHouse appManipulated flag
  "ch": { "host": "...", "user": "...", "password": "..." }
}
```

### Response

```json
{
  "ok": true,
  "ecgi_resolved": ["234100548264703", "..."],
  "h3_resolution": 10,
  "total_samples": 12873,
  "total_hexes": 421,
  "time_window_hours": 720,
  "metric": "p50_rsrp",
  "hexes": [
    {
      "h3": "8a194ad32d97fff",
      "samples": 47,
      "p50_rsrp": -82,
      "avg_rsrp": -83.4,
      "max_rsrp": -71,
      "p75_rsrp": -78,
      "std_rsrp": 5.2,
      "tech": "LTE"           // dominant tech in this hex
    }
  ]
}
```

### SQL pattern (use `geoToH3` — ClickHouse built-in)

```sql
SELECT
  geoToH3(location_geo_coordinates.1,
          location_geo_coordinates.2,
          {h3_res:UInt8}) AS h3,
  count() AS samples,
  quantileExact(0.5)(signal_rsrp) AS p50_rsrp,
  avg(signal_rsrp) AS avg_rsrp,
  max(signal_rsrp) AS max_rsrp,
  quantileExact(0.75)(signal_rsrp) AS p75_rsrp,
  stddevPop(signal_rsrp) AS std_rsrp,
  argMax(tech, samples) AS tech_dominant   -- approx; replace with anyHeavy if needed
FROM measurements
WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
  AND (
    cell_ecgi IN {ecgis:Array(String)}
    OR cell_cgi IN {ecgis:Array(String)}
  )
  AND signal_rsrp != 0
  AND location_geo_coordinates.1 != 0
  AND location_geo_coordinates.2 != 0
GROUP BY h3
HAVING samples >= {min_samples:UInt32}
ORDER BY samples DESC
LIMIT {result_limit:UInt32}
FORMAT JSON
```

Rules of the road (these are non-negotiable):

- **`timestamp` filter at WHERE level**, not in `countIf`. Partition pruning depends on it.
- **`signal_rsrp != 0`** — column is `Int32` with default 0; filter mandatory.
- **Coordinate guards** on both `.1` and `.2` non-zero.
- **Use ClickHouse parameter substitution** (`{name:Type}`), not string concatenation. The proxy already exposes a generic `/query` endpoint as reference.
- **Use `quantileExact(0.5)`** for the median — `quantile` (TDigest) is biased on small samples and we may have hexes with only a handful of measurements.

### Adaptive resolution (when `h3_resolution` is null)

Run one extra pre-query first:

```sql
SELECT count() FROM measurements
WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
  AND (cell_ecgi IN {ecgis:Array(String)} OR cell_cgi IN {ecgis:Array(String)})
  AND signal_rsrp != 0
```

Then pick:

| Sample count | H3 resolution | Approx edge | Approx area |
|---|---|---|---|
| ≥ 20,000 | 11 | ~25 m | ~2,100 m² |
| 1,000 – 20,000 | 10 | ~65 m | ~15,000 m² |
| < 1,000 | 9 | ~175 m | ~105,000 m² |

### Identifier normalisation (server-side)

The user may submit any combination of ECGI / ECI / eNB. Normalise to ECGIs before querying:

- **ECGI** — accept directly (canonical).
- **ECI + PLMN** — query `SELECT DISTINCT cell_ecgi FROM measurements WHERE cell_eci IN (...) AND network_PLMN = ? AND timestamp > now() - INTERVAL 30 DAY LIMIT 100`. If multiple ECGIs map to one ECI across operators, return all but warn in response (`"ambiguous_inputs": [...]`).
- **eNB + PLMN** — expand to all child ECIs: LTE `eci = enb*256 + sector_id` for sector ∈ [0,255]. Or query directly: `cell_enb = ? AND network_PLMN = ?`.

If `plmn` is missing and the user submitted ECI/eNB, return `400` with `"error": "PLMN required for ECI/eNB inputs"`.

### Caching

Cache key: `sorted(ecgis).join(',') + '|' + hours + '|' + h3_resolution`. TTL: 300 s. In-memory dict on the proxy is fine — the proxy is single-process and short-lived. Mirror the helper pattern in the FlyC2 `db.js` skill but adapted to Python (a simple `time.monotonic()`-stamped dict will do).

---

## 4. Frontend — `cell-footprint.html`

### Layout

- **Sidebar (480px)**:
  1. Tool switcher (top — `SQL Builder | Signal Map | TAC Detector | Cell Footprint`).
  2. Connection bar (host/user/pass) — reuse the connection-panel pattern from `db-dashboard.html` verbatim.
  3. **Query Settings** panel with the same look as the screenshot the user already approved:
     - Dropdown "Query Type" pre-set to "Cell / Sector RSRP Footprint" (no other options for now).
     - Three textareas: `eNB / gNB / RNC / LAC`, `ECI / NCI / CI / CID`, `ECGI / CGI` — comma- or newline-separated.
     - `PLMN` input (text, e.g. `234-10`). Required when ECI/eNB present.
     - Time window dropdown: `Last Day | Last Week | Last 2 Weeks | Last Month | Custom Range`.
     - Aggregation metric dropdown: `Median (P50) | Average | Max | P75`. Default Median.
     - H3 resolution: `Auto | 9 (coarse) | 10 (medium) | 11 (fine)`. Default Auto.
     - Min samples per hex: number input, default 3.
     - Include NSA synthesized: checkbox, checked by default.
     - Result limit: number input, default 50000.
  4. Big `Run` button.
- **Main area**:
  - Full-bleed Leaflet map. CartoDB dark tiles with the existing brightness filter.
  - Bottom-left **info card** showing: total samples, total hexes, H3 resolution used, time window, dominant tech, mean RSRP, ECGI(s) resolved.
  - Bottom-right **RSRP legend** with the exact gradient from the screenshot the user shared:
    - `> -65 dBm` red, `-65…-80` orange, `-80…-95` yellow/green, `-95…-110` blue, `< -110` deep blue.
    - Use this discrete bucketing — not a continuous gradient — so the heatmap reads cleanly.
  - Top-right **metric toggle pills** (`Median | Avg | Max | P75`). Re-color on click without re-querying — the API already returned all four values per hex.

### Hex rendering

Add `h3-js` from CDN (`https://unpkg.com/h3-js@4`). For each returned hex:

```js
const polygon = h3.cellToBoundary(hex.h3, true); // true = GeoJSON [lng, lat] order
const color = rsrpToColor(hex[currentMetric]);
const layer = L.polygon(polygon.map(([lng, lat]) => [lat, lng]), {
  color: color,
  weight: 0.5,
  fillColor: color,
  fillOpacity: 0.65
});
layer.bindTooltip(`
  <strong>${hex.samples} samples</strong><br/>
  P50: ${hex.p50_rsrp} dBm · Avg: ${hex.avg_rsrp.toFixed(1)}<br/>
  Max: ${hex.max_rsrp} · σ: ${hex.std_rsrp.toFixed(1)}<br/>
  Tech: ${hex.tech_dominant}
`);
```

After all hexes added, fit map bounds via `map.fitBounds(L.featureGroup(layers).getBounds())` so the user lands on the cell footprint immediately.

### Color mapping (frontend)

```js
function rsrpToColor(rsrp) {
  if (rsrp >= -65)   return '#ef4444'; // red — very strong
  if (rsrp >= -80)   return '#f59e0b'; // orange
  if (rsrp >= -95)   return '#22c55e'; // green
  if (rsrp >= -110)  return '#3b82f6'; // blue
  return '#1e3a5f';                    // deep blue — weak
}
```

### Run flow

1. Read inputs, build the request body.
2. `POST /query/cell-footprint`.
3. On `200`: clear existing hex layer, render new hexes, update info card, fit bounds.
4. On `400`: surface error in a toast at the top of the map (PLMN missing, ambiguous ECI, etc.).
5. On `500`: show ClickHouse error verbatim in the info card.

---

## 5. What this app does NOT do

Out of scope — do not add:

- **No site / cell-tower markers.** The user explicitly wants the footprint only, not the cell location.
- **No polygon drawing.** Footprint is defined by the cell, not by a polygon. (If they need polygon constraint later, that's a follow-up.)
- **No editing of `measurements` table.** Read-only.
- **No FlyC2 repo touches.** This is the Analysis Suite only.
- **No saved-query persistence.** That belongs in `sql-builder.html`.
- **No ML / Random Forest classification.** That lives in the existing coverage analysis flow in `clickhouse_proxy.py` — leave it alone.

---

## 6. Acceptance / verification

Local run:

```bash
cd "Analysis Suite"
python3 clickhouse_proxy.py
# open http://localhost:8000/cell-footprint.html
```

Manual test cases:

1. **Plain ECGI** — paste a known 4G ECGI, click Run. Expect ≥10 hexes, info card shows total samples and time window. Hexes are clickable and show the tooltip.
2. **ECI + PLMN** — paste an ECI without PLMN → expect inline error "PLMN required". Add PLMN → expect normalisation to one or more ECGIs (info card shows `ecgi_resolved`).
3. **eNB + PLMN** — paste an eNB (e.g. `33`) with PLMN. Expect multiple sectors (multiple ECIs) all returned as one combined footprint.
4. **Sparse cell** — pick a cell with low sample count. Expect `h3_resolution: 9` chosen automatically.
5. **Dense urban cell** — pick a cell in central London / Singapore. Expect `h3_resolution: 11` and >500 hexes.
6. **Metric toggle** — switch between Median / Avg / Max / P75. Map re-colors instantly without re-querying.
7. **Empty / unknown cell** — query an ECGI not in the DB. Expect `ok: true, total_samples: 0, hexes: []` and the info card displays "No measurements found".

Performance check: a typical urban cell with 50k–200k samples should return in under 5 seconds. If slower, confirm the `timestamp` predicate is at WHERE level and the `INTERVAL` parameter is being substituted server-side. The pre-count query for adaptive resolution should be <1 s — if it isn't, your query is missing partition pruning.

---

## 7. Hand-off checklist

When you're done:

- [ ] `cell-footprint.html` exists and renders standalone at `localhost:8000/cell-footprint.html`.
- [ ] `clickhouse_proxy.py` has one new route `/query/cell-footprint` and nothing else changed in its behaviour.
- [ ] Tool switcher entry added to `sql-builder.html`, `db-dashboard.html`, `nmf-viewer.html`.
- [ ] All seven manual test cases pass.
- [ ] No FlyC2 repo files touched.
- [ ] The dark theme matches the rest of the suite — no rogue light backgrounds or non-brand colors.

Stop and ask if anything in the schema (table name, column types) doesn't match what you find — the SQL above assumes `measurements` with `location_geo_coordinates` as a Point and `signal_rsrp` as `Int32`. If the local Analysis Suite uses a different table name (e.g. `measurements_year_geo`), adjust the SQL but keep all the other rules of the road intact.
