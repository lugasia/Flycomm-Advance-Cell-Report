# Advanced Cell Report - SQL Queries & Reporting Reference

This document provides a comprehensive reference for all SQL queries and reporting capabilities in the Advanced Cell Report platform.

---

## Table of Contents

1. [SQL Builder Query Types](#sql-builder-query-types)
   - [SELECT (Signal Analysis)](#1-select-signal-analysis)
   - [Cell/eNB Search](#2-cellenb-search)
   - [TAC Anomaly Detection](#3-tac-anomaly-detection)
   - [User Contributors](#4-user-contributors-regulatoroperator)
2. [Common Filters](#common-filters)
3. [Reporting Capabilities](#reporting-capabilities)
   - [Forensic Intelligence Report](#forensic-intelligence-report)
   - [Contributors Insight Report](#contributors-insight-report)
   - [ML Coverage Analysis](#ml-coverage-analysis)
4. [ClickHouse Schema Reference](#clickhouse-schema-reference)
5. [MCC Reference Table](#mcc-reference-table)

---

## SQL Builder Query Types

### 1. SELECT (Signal Analysis)

Extracts signal data within a polygon area for visualization on the Signal Map.

**Use Case:** Analyze network coverage, operator distribution, and signal patterns in a specific geographic area.

```sql
SELECT
    network_PLMN,
    network_operator,
    network_iso,
    count(network_PLMN) AS counted,
    tupleElement(location_geo_coordinates, 1) AS longitude,
    tupleElement(location_geo_coordinates, 2) AS latitude,
    timestamp
FROM measurements
WHERE
    network_mcc != '425'                    -- Exclude MCC (optional)
    AND network_mcc = '416'                 -- Include MCC (optional)
    AND timestamp >= toDateTime('2026-01-01 00:00:00')
    AND timestamp <= toDateTime('2026-03-02 23:59:59')
    AND source IN ('regulator', 'operator') -- Source filter (optional)
    AND pointInPolygon(location_geo_coordinates, [(lon1, lat1), (lon2, lat2), ...])
GROUP BY
    network_PLMN,
    network_operator,
    network_iso,
    longitude,
    latitude,
    timestamp
LIMIT 50000
```

**Output Columns:**
| Column | Description |
|--------|-------------|
| `network_PLMN` | Public Land Mobile Network (MCC-MNC) |
| `network_operator` | Operator name |
| `network_iso` | ISO country code |
| `counted` | Number of signal samples |
| `longitude` | Geographic longitude |
| `latitude` | Geographic latitude |
| `timestamp` | Measurement timestamp |

---

### 2. Cell/eNB Search

Search for specific cell towers or find all cells within a polygon area. Includes RSRP coverage data.

**Use Case:** Locate specific base stations, analyze cell coverage quality, identify cells in a geographic cluster.

#### Mode A: Find All Cells in Polygon (Default)
When eNB/Cell ID fields are empty, finds ALL cells within the drawn polygon.

```sql
-- All Cells in Polygon Area with RSRP Coverage
SELECT
    cell_enb,
    cell_eci,
    cell_ci,
    network_mcc,
    network_mnc,
    network_PLMN,
    network_operator,
    count() AS samples,
    avg(signal_rsrp) AS avg_rsrp,
    min(signal_rsrp) AS min_rsrp,
    max(signal_rsrp) AS max_rsrp,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    tupleElement(location_geo_coordinates, 1) AS longitude,
    tupleElement(location_geo_coordinates, 2) AS latitude
FROM measurements
WHERE
    pointInPolygon(location_geo_coordinates, [(lon1, lat1), (lon2, lat2), ...])
    AND network_mcc = '425'
    AND timestamp >= toDateTime('2026-01-01 00:00:00')
GROUP BY
    cell_enb, cell_eci, cell_ci,
    network_mcc, network_mnc, network_PLMN, network_operator,
    longitude, latitude
ORDER BY
    cell_enb, samples DESC
LIMIT 50000
```

#### Mode B: Search Specific IDs
When eNB or Cell IDs are provided, searches for those specific cells.

```sql
-- Cell/eNB Search Query with RSRP Coverage
SELECT
    cell_enb,
    cell_eci,
    cell_ci,
    network_mcc,
    network_mnc,
    network_PLMN,
    network_operator,
    count() AS samples,
    avg(signal_rsrp) AS avg_rsrp,
    min(signal_rsrp) AS min_rsrp,
    max(signal_rsrp) AS max_rsrp,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    tupleElement(location_geo_coordinates, 1) AS longitude,
    tupleElement(location_geo_coordinates, 2) AS latitude
FROM measurements
WHERE
    (cell_enb IN (12345, 67890) OR cell_eci IN (111, 222, 333))
    AND pointInPolygon(location_geo_coordinates, [...])  -- Optional
GROUP BY
    cell_enb, cell_eci, cell_ci,
    network_mcc, network_mnc, network_PLMN, network_operator,
    longitude, latitude
ORDER BY
    cell_enb, samples DESC
LIMIT 50000
```

**Output Columns:**
| Column | Description |
|--------|-------------|
| `cell_enb` | eNodeB ID (base station) |
| `cell_eci` | E-UTRAN Cell Identifier |
| `cell_ci` | Cell ID |
| `network_mcc` | Mobile Country Code |
| `network_mnc` | Mobile Network Code |
| `samples` | Number of measurements |
| `avg_rsrp` | Average Reference Signal Received Power (dBm) |
| `min_rsrp` | Minimum RSRP |
| `max_rsrp` | Maximum RSRP |
| `first_seen` | First observation timestamp |
| `last_seen` | Last observation timestamp |

**RSRP Coverage Classification:**
| Level | RSRP Range | Color |
|-------|------------|-------|
| Excellent | > -80 dBm | Green |
| Good | -80 to -90 dBm | Light Green |
| Fair | -90 to -100 dBm | Yellow |
| Poor | -100 to -110 dBm | Orange |
| Bad | < -110 dBm | Red |

---

### 3. TAC Anomaly Detection

Detects cells with changing Tracking Area Codes (TAC), which may indicate IMSI-catchers or rogue base stations.

**Use Case:** SIGINT analysis, detecting potential Stingray/IMSI-catcher devices, identifying suspicious cell behavior.

```sql
SELECT
    network_mcc,
    network_mnc,
    cell_eci,
    cell_enb,
    cell_ci,
    uniqExact(cell_tac) AS distinct_tac_count,
    groupUniqArray(cell_tac) AS tac_list,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    count() AS total_samples,
    groupUniqArray(network_operator) AS operator_names,
    groupUniqArray(location_tileId_10) AS location_tiles
FROM measurements
WHERE
    cell_eci IS NOT NULL
    AND cell_tac IS NOT NULL
    AND network_mcc IS NOT NULL
    AND tech IN ('LTE', 'NR')              -- Technology filter
    AND network_mcc = '425'                 -- MCC filter (optional)
    AND timestamp >= toDateTime('2026-01-01 00:00:00')
    AND timestamp <= toDateTime('2026-03-02 23:59:59')
    AND pointInPolygon(location_geo_coordinates, [...])
GROUP BY
    network_mcc,
    network_mnc,
    cell_eci,
    cell_enb,
    cell_ci
HAVING
    distinct_tac_count > 2                  -- Min TAC changes threshold
ORDER BY
    distinct_tac_count DESC,
    total_samples DESC
LIMIT 5000
```

**Output Columns:**
| Column | Description |
|--------|-------------|
| `network_mcc` | Mobile Country Code |
| `network_mnc` | Mobile Network Code |
| `cell_eci` | E-UTRAN Cell Identifier |
| `cell_enb` | eNodeB ID |
| `cell_ci` | Cell ID |
| `distinct_tac_count` | Number of different TACs observed |
| `tac_list` | Array of TAC values seen |
| `first_seen` | First observation |
| `last_seen` | Last observation |
| `total_samples` | Total measurements |
| `operator_names` | Array of operator names |
| `location_tiles` | Array of location tile IDs |

**Anomaly Severity Classification:**
| TAC Jumps | Severity | Indicator |
|-----------|----------|-----------|
| 8+ | Critical (Red) | High probability of active IMSI-catcher |
| 5-7 | High (Orange) | Medium anomaly, requires investigation |
| 2-4 | Low (Yellow) | Possible network reconfiguration |

**Intelligence Assessment Patterns:**
- High jumps + Low samples = Tactical Stingray device
- TAC 65535 or 0 = Rogue/pirate equipment
- Multiple operators on same cell = Spoofing attempt

---

### 4. User Contributors (Regulator/Operator)

Analyzes unique device contributions to the measurement database, useful for regulators and operators.

**Use Case:** Track data contributors, measure operator participation, analyze monthly contribution trends.

```sql
-- User Contributors Report (Regulator/Operator Statistics)
-- Filtered by polygon area
SELECT
    network_mcc,
    network_operator,
    source,
    toStartOfMonth(timestamp) AS month,
    uniqExact(deviceInfo_deviceId) AS unique_users,
    count() AS total_samples,
    min(timestamp) AS first_contribution,
    max(timestamp) AS last_contribution
FROM measurements
WHERE
    deviceInfo_deviceId IS NOT NULL
    AND pointInPolygon(location_geo_coordinates, [(lon1, lat1), ...])
    AND network_operator IN ('Cellcom', 'Partner')  -- Operator filter (optional)
    AND network_mcc = '425'                          -- MCC filter (optional)
    AND timestamp >= toDateTime('2026-01-01 00:00:00')
    AND timestamp <= toDateTime('2026-03-02 23:59:59')
    AND source IN ('regulator', 'operator')         -- Source filter (optional)
GROUP BY
    network_mcc,
    network_operator,
    source,
    month
ORDER BY
    unique_users DESC
LIMIT 1000
```

**Grouping Options:**
- By Operator: Group by `network_operator`
- By Source: Group by `source` (regulator/operator/crowd)
- By Month: Group by `toStartOfMonth(timestamp)`
- By MCC: Group by `network_mcc`

**Output Columns:**
| Column | Description |
|--------|-------------|
| `network_mcc` | Mobile Country Code |
| `network_operator` | Operator name |
| `source` | Data source type |
| `month` | Month start date |
| `unique_users` | Count of unique device IDs |
| `total_samples` | Total measurements |
| `first_contribution` | First contribution date |
| `last_contribution` | Last contribution date |

---

## Common Filters

All query types support the following filter options:

### Polygon Filter
```sql
pointInPolygon(location_geo_coordinates, [(lon1, lat1), (lon2, lat2), ...])
-- OR for exclusion:
NOT pointInPolygon(location_geo_coordinates, [...])
```

### MCC (Country) Filters
```sql
-- Include specific MCC
network_mcc = '425'

-- Exclude specific MCC
network_mcc != '425'
```

### Timeline Filter
```sql
timestamp >= toDateTime('2026-01-01 00:00:00')
AND timestamp <= toDateTime('2026-03-02 23:59:59')
```

### Source Filter
```sql
source IN ('regulator', 'operator', 'crowd')
```

### Technology Filter (TAC queries)
```sql
tech IN ('LTE', 'NR', 'WCDMA', 'GSM', 'CDMA')
```

---

## Reporting Capabilities

### Forensic Intelligence Report

Generated from the Signal Map (index.html) after data is loaded and filtered.

**Features:**
- MCC distribution analysis with bar charts
- Anomaly detection (PLMN/Operator mismatches)
- Threat classification: CRITICAL, HIGH, MEDIUM
- Jordan border proximity analysis (35.3° longitude threshold)
- Bilingual support (English/Hebrew)

**Anomaly Detection Rules:**

| Condition | Severity | Assessment |
|-----------|----------|------------|
| PLMN 416-77 | CRITICAL | Phantom/unregistered PLMN |
| MCC 432, 417, 418 (Iran, Syria, Iraq) | CRITICAL | Hostile nation MCC |
| Israeli operator + Foreign MCC | CRITICAL | Operator/MCC mismatch |
| Egyptian MCC (602) deep inside Israel | CRITICAL | Deep penetration anomaly |
| Jordanian MCC (416) west of 35.3° | HIGH | Deep spillover |
| Any foreign MCC | HIGH/MEDIUM | Foreign network presence |
| MCC 000 or 255 | MEDIUM | Test/Invalid network |

**Report Sections:**
1. Executive Summary (total records, anomalies, foreign MCCs)
2. MCC Distribution (visual bar chart)
3. Anomaly Table (severity, PLMN, operator, assessment)
4. Technical Details (coordinates, sample counts)

---

### Contributors Insight Report

Generated from User Contributors query results via "Generate Insight Report" button.

**Features:**
- KPI Cards: Total users, total samples, operators, sources
- Monthly trend analysis with timeline
- Operator breakdown (pie chart data)
- Source distribution analysis
- MCC/Country breakdown
- Screenshot capture (PNG export)

**Report Sections:**
1. KPI Dashboard (4 cards)
2. Monthly Contribution Trends
3. Top Operators Analysis
4. Data Sources Distribution
5. Geographic (MCC) Breakdown

---

### ML Coverage Analysis

Server-side machine learning analysis using Random Forest + RSRP classification.

**Endpoint:** `POST /ml/coverage`

**Request Body:**
```json
{
  "cells": [
    {
      "latitude": 32.0853,
      "longitude": 34.7818,
      "samples": 150,
      "cell_enb": "12345",
      "cell_eci": "67890",
      "network_mcc": "425",
      "network_mnc": "01",
      "avg_rsrp": -85,
      "min_rsrp": -95,
      "max_rsrp": -75
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "total_cells": 100,
  "has_rsrp": true,
  "coverage_stats": {
    "excellent": 15,
    "good": 35,
    "fair": 30,
    "poor": 15,
    "bad": 5
  },
  "model": "RandomForest + RSRP Coverage",
  "results": [
    {
      "lat": 32.0853,
      "lon": 34.7818,
      "enb": "12345",
      "eci": "67890",
      "samples": 150,
      "mcc": "425",
      "mnc": "01",
      "avg_rsrp": -85,
      "coverage_level": "good",
      "coverage_color": "#84cc16",
      "coverage_label": "Good (-90 to -80 dBm)",
      "coverage_score": 55,
      "confidence": 0.92
    }
  ]
}
```

**ML Features Used:**
- Latitude, Longitude
- Log-transformed sample count
- eNB ID (mod 1000)
- ECI (mod 256)
- RSRP value

---

## ClickHouse Schema Reference

### Primary Table: `measurements`

| Column | Type | Description |
|--------|------|-------------|
| `location_geo_coordinates` | Tuple(Float64, Float64) | (longitude, latitude) |
| `network_mcc` | String | Mobile Country Code |
| `network_mnc` | String | Mobile Network Code |
| `network_PLMN` | String | MCC-MNC combined |
| `network_operator` | String | Operator name |
| `network_iso` | String | ISO country code |
| `cell_eci` | UInt64 | E-UTRAN Cell ID |
| `cell_enb` | UInt32 | eNodeB ID |
| `cell_ci` | UInt16 | Cell ID |
| `cell_tac` | UInt16 | Tracking Area Code |
| `signal_rsrp` | Int16 | Reference Signal Received Power |
| `tech` | String | Technology (LTE, NR, WCDMA, GSM, CDMA) |
| `timestamp` | DateTime | Measurement timestamp |
| `source` | String | Data source type |
| `deviceInfo_deviceId` | String | Device identifier |
| `location_tileId_10` | String | Location tile ID |

### ClickHouse Functions Used

```sql
-- Point in polygon check
pointInPolygon(location_geo_coordinates, [(lon1, lat1), ...])

-- Extract tuple elements
tupleElement(location_geo_coordinates, 1) AS longitude
tupleElement(location_geo_coordinates, 2) AS latitude

-- Aggregations
uniqExact(column)         -- Exact unique count
groupUniqArray(column)    -- Unique values as array
count()                   -- Total count
avg(column)               -- Average
min(column)               -- Minimum
max(column)               -- Maximum

-- Date functions
toStartOfMonth(timestamp) -- First day of month
toDateTime('YYYY-MM-DD HH:MM:SS')
```

---

## MCC Reference Table

### Common MCC Codes

| MCC | Country | Region |
|-----|---------|--------|
| 425 | Israel | Middle East |
| 416 | Jordan | Middle East |
| 602 | Egypt | Africa |
| 420 | Saudi Arabia | Middle East |
| 417 | Syria | Middle East |
| 418 | Iraq | Middle East |
| 432 | Iran | Middle East |
| 202 | Greece | Europe |
| 214 | Spain | Europe |
| 310-316 | United States | North America |
| 234 | United Kingdom | Europe |

### Critical/Hostile MCCs (Auto-flagged)
- **432** - Iran
- **417** - Syria
- **418** - Iraq

### Special MCCs
- **000** - Test network
- **255** - Invalid/undefined
- **416-77** - Phantom PLMN (always suspicious)

---

## API Endpoints

### ClickHouse Proxy Server

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Execute ClickHouse query |
| `/ml/coverage` | POST | ML coverage analysis |
| `/*` | GET | Serve static files |

**Query Request:**
```json
{
  "query": "SELECT ...",
  "host": "your-clickhouse-host",
  "database": "default",
  "user": "username",
  "password": "password"
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03 | Initial documentation |

---

*Generated by Advanced Cell Report Platform*
