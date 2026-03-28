# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
**Advanced Cell Report** is a web-based cellular network signal analysis platform. It visualizes mobile network data on interactive maps, detects anomalies (potential IMSI-catchers, rogue base stations), and generates forensic intelligence reports.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Map**: Leaflet.js + leaflet-heat plugin
- **Icons**: Material Icons (Google Fonts CDN)
- **Fonts**: Inter (UI), JetBrains Mono (code)
- **Backend**: None (pure client-side)
- **Database queries**: ClickHouse SQL (generated, not executed)

## File Structure
```
├── index.html                    # Main app - signal map viewer
├── sql-builder.html              # Polygon-based ClickHouse SQL generator
├── anomaly-detector.html         # TAC anomaly detection (IMSI-catcher hunter)
├── cellular_anomaly_detector.py  # Streamlit version of anomaly detector
├── app.js                        # All application logic for index.html
├── style.css                     # Styles for index.html
├── report.html                   # Static report template (reference only)
├── server.py                     # Simple HTTP server (python3 server.py)
└── CLAUDE.md                     # This file
```

## Key Features

### Signal Map (index.html)
- CSV upload with auto-column detection
- Heatmap and dot visualization modes
- Multi-select filters: Operator, PLMN (with country names), ISO/Country
- Operator legend with MCC codes displayed
- Time range filtering with histogram
- Data table with click-to-fly navigation
- Forensic Report generation (respects all active filters)
- Bilingual support (EN/HE)

### SQL Builder (sql-builder.html)
- Draw polygons/rectangles on map
- Generate ClickHouse SQL for:
  - SELECT queries (analysis)
  - ALTER UPDATE queries (modify MCC)
- Uses `pointInPolygon()` function
- Supports MCC filtering (include/exclude)
- Timeline filter with date range (from/to)

### Forensic Report (generated dynamically)
- Analyzes filtered data for anomalies
- Detects PLMN/Operator mismatches
- Classifies threats: CRITICAL, HIGH, MEDIUM
- Jordan border logic (lon 35.3° threshold)
- RTL support for Hebrew

### TAC Anomaly Detector (anomaly-detector.html)
- Detects cells with changing TAC (potential IMSI-catchers)
- JSON file upload from ClickHouse exports
- Filters by MCC (country) and minimum TAC jumps
- Intelligence assessment for each suspicious cell:
  - High jumps + low samples = Tactical Stingray
  - TAC 65535/0 = Rogue/pirate equipment
  - Multiple operators = Spoofing attempt
- Color-coded severity (red: 8+, orange: 5-7, yellow: 2-4)
- Data table with click-to-fly navigation

## Data Model

### CSV Expected Columns
| Field     | Auto-detected names                    |
|-----------|----------------------------------------|
| Latitude  | lat, latitude                          |
| Longitude | lon, lng, longitude                    |
| Operator  | network_operator, operator, carrier    |
| PLMN      | network_PLMN, plmn, mcc                |
| ISO       | network_iso, iso, country              |
| Timestamp | timestamp, time, date, datetime        |
| Count     | counted, count, cnt, weight            |

### ClickHouse Schema — Full `measurements` Table

**Table:** `measurements` | ~530M+ rows total

#### Coordinate access
```sql
location_geo_coordinates          -- Type: Point
location_geo_coordinates.1        -- longitude
location_geo_coordinates.2        -- latitude
-- Also available: bin_lat, bin_lon (floored), location_tileId_1/10/100
```

#### Key field groups
| Group | Fields |
|-------|--------|
| **Identity** | `id`, `timestamp`, `createdAt`, `source`, `sample_id` |
| **Location** | `location_accuracy`, `location_altitude`, `location_speed`, `location_heading`, `location_geo_coordinates`, `loc_timestamp` |
| **GPS Satellites** | `satellites_gps_satellitesNo`, `satellites_glonass_satellitesNo`, `satellites_galileo_satellitesNo`, `satellites_beidou_satellitesNo`, `satellites_qzss_satellitesNo`, `satellites_gnss_satellitesNo` + `_satellitesList` arrays |
| **Device** | `deviceInfo_deviceId`, `deviceInfo_deviceModel`, `deviceInfo_imei`, `deviceInfo_imsi`, `deviceInfo_deviceReleaseVersion`, `deviceInfo_modemVersion`, `deviceInfo_uptime`, `deviceInfo_temperature`, `deviceInfo_appVersion` |
| **Cell** | `cell_ecgi`, `cell_eci`, `cell_cid`, `cell_ci`, `cell_lac`, `cell_tac`, `cell_pci`, `cell_psc`, `cell_nci`, `cell_enb`, `cell_cgi`, `cell_bsic`, `cell_rnc` |
| **Network** | `network_mcc`, `network_mnc`, `network_PLMN`, `network_operator`, `network_iso`, `network_isRoaming`, `network_VPLMN` + virtual carrier fields |
| **Signal** | `signal_rsrp` (Int32, always set), `signal_rsrq`, `signal_rssi`, `signal_snr`, `signal_rscp`, `signal_ecio`, `signal_cqi`, `signal_ssSinr`, `signal_csiRsrp`, `signal_timingAdvance`, `signal_txPower` |
| **Band** | `band_number`, `band_name`, `band_duplexMode`, `band_channelNumber`, `band_bandwidth`, `band_downlinkEarfcn`, `band_downlinkUarfcn`, `band_bands_list` |
| **Tech** | `tech` (LowCardinality: NR, LTE, WCDMA, GSM) |
| **Internet** | `internet_downloadMbps`, `internet_uploadMbps`, `internet_latency`, `internet_jitter`, `internet_latencyLoss` |
| **Environment** | `environment_type`, `environment_floor`, `environment_hasWindow`, `building_info_floor`, `building_info_indoor` |

#### Source field values (confirmed data)
| source | ~Rows | Notes |
|--------|-------|-------|
| `''` (blank) | 513M | Oldest data, pre-2024 |
| `nperf` | 7M | Speed test app |
| `flycomm` | 3.8M | Main SDK |
| `modem` | 3.2M | Teltonika RSU routers |
| `flycomm-os` | 2.4M | OS-level SDK |
| `hopon` | 934K | Partner app |
| `Safe2Talk` | 233K | Partner app |
| `WingZ` | 158K | Partner app |
| `FlycommContainer` | 18K | Container SDK |
| `wavebrook` | 1.5K | Partner |

#### Modem source specifics (`source = 'modem'`)
- Devices: **Teltonika RUTX5000** (5G) and **RUTX1200** (4G) — fixed RSU routers
- Only cellular tech: LTE (~3.19M rows) + WCDMA (482 rows)
- **NO WiFi fields in schema** — WiFi scanning is not part of the measurements table
- GPS quality: avg accuracy 0.67m, avg 11.3 GPS satellites tracked
- Extra fields populated: `deviceInfo_imei`, `deviceInfo_temperature`, `deviceInfo_uptime`, `deviceInfo_modemVersion`
- 7 unique devices (by IMEI), all located in Israel

#### Important query notes
- `location_geo_coordinates` is Point type — access lon/lat as `.1`/`.2`
- `signal_rsrp` is `Int32` (NOT NULL, defaults to 0) — filter `signal_rsrp != 0` for real data
- `cell_ecgi` is NULL for modem rows (use `cell_cgi` instead for 2G/3G global cell ID)
- WiFi data does NOT exist anywhere in measurements — no wifi_ columns at all

### TAC Anomaly Detector JSON Format
Expected columns from ClickHouse export:
| Field | Description |
|-------|-------------|
| network_mcc | Mobile Country Code |
| network_mnc | Mobile Network Code |
| cell_eci | E-UTRAN Cell ID (antenna) |
| distinct_tac_count | Number of different TACs observed |
| tac_list | List of TAC values seen |
| total_samples | Number of measurements |
| first_seen | First observation date |
| operator_names | Array of operator names |
| location_tiles | Array of coordinates ['lon,lat'] |

## Important Constants

### MCC Codes (Mobile Country Codes)
```javascript
425 = Israel, 416 = Jordan, 602 = Egypt, 420 = Saudi Arabia,
417 = Syria, 418 = Iraq, 432 = Iran, 202 = Greece, 214 = Spain
```

### Critical MCCs (hostile nations)
```javascript
['432', '417', '418'] // Iran, Syria, Iraq
```

### Jordan Border Threshold
```javascript
const JORDAN_BORDER_LON = 35.3;
// PLMNs 416-xx east of this = natural spillover (not suspicious)
// PLMNs 416-xx west of this = deep inside Israel (suspicious)
// Exception: 416-77 is ALWAYS suspicious (phantom/unregistered)
```

## Color Palette
```css
--navy: #0a1628      /* Background */
--card: #162038      /* Card/panel background */
--accent: #3b82f6    /* Blue accent */
--red: #ef4444       /* Critical severity */
--orange: #f59e0b    /* High severity */
--cyan: #06b6d4      /* Medium severity */
--text: #e2e8f0      /* Primary text */
```

## Development

### Run locally
```bash
python3 -m http.server 8000
# or
python3 server.py
```
Then open http://localhost:8000

### Key Functions (app.js)
- `generateReport()` - Creates forensic HTML report
- `analyzeAnomalies()` - Detects PLMN/operator mismatches
- `applyFilters()` - Filters data and updates UI
- `initReportControls()` - Language toggle + report button

## Architecture Notes

### Map Styling
All maps use CartoDB dark tiles with enhanced brightness:
```css
filter: brightness(1.6) contrast(1.1) saturate(1.1);
```

### Report Generation
Reports are generated from `APP.filtered` data, which respects all active filters (operators, PLMNs, countries, date range). The report opens in a new tab via `window.open()` + `document.write()`.

### Navigation
Two-tier navigation system:

**Bottom nav** (all pages): `SIGINT | Workbench | Roaming | Dashboard`
- 4 items, always visible at the bottom of every sidebar

**Tool switcher** (trio pages only): `SQL Builder | Signal Map | TAC Detector`
- Appears at the **top** of the sidebar in `sql-builder.html`, `index.html`, `anomaly-detector.html`
- SQL Builder is the "hub" — Signal Map and TAC Detector are sibling tools accessible via the switcher
- Signal Map and TAC Detector are NOT in the bottom nav (they live only in the tool switcher)
- CSS class: `.tool-switcher` in `style.css`, active item uses `.current`

### Bilingual Support
All report content uses a `LANG` object with `en`/`he` keys. Hebrew content renders RTL.

### Client-Side Only
- No backend or external APIs
- Leaflet Draw plugin for polygon drawing in SQL Builder
- Uses Catppuccin Mocha color scheme (CSS variables)
