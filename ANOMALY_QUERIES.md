# FCIC Anomaly Detection — Query Reference

> **Classification:** Internal Use — Advanced Cell Report Platform
> **Database:** ClickHouse — `measurements` table
> **Platform:** anomaly-workbench.html
> **Last Updated:** 2026-03-08

---

## Overview

This document provides the complete reference for all 10 anomaly detection types available in the FCIC Anomaly Workbench. Each type generates a ClickHouse SQL query that can be run directly via the workbench or copied and executed manually.

**All queries output:**
- `lat` / `lon` — average coordinates for map plotting
- `counted` — number of raw measurement samples
- `first_seen` / `last_seen` — temporal range of the anomaly
- Severity is classified **client-side** using the tier logic described per anomaly

---

## How to Use This Guide

1. **Copy the SQL** — paste directly into ClickHouse query console or the workbench SQL viewer
2. **Replace `{param}` placeholders** with your chosen values (or use the workbench sliders)
3. **Add polygon filter** (optional) — append `AND pointInPolygon(location_geo_coordinates, [(lon1,lat1), ...])` to the WHERE clause
4. **Add time filter** (optional) — append `AND timestamp >= 'YYYY-MM-DD HH:MM:SS'` and/or `AND timestamp <= '...'`

---

## Database Schema Quick Reference

| Column | Type | Description |
|--------|------|-------------|
| `location_geo_coordinates` | Tuple | (longitude, latitude) — `.1` = lon, `.2` = lat |
| `tech` | String | Radio technology: `GSM`, `LTE`, `NR`, `WCDMA` |
| `network_PLMN` | String | Home PLMN (MCC+MNC, e.g., "42501" = Partner Israel) |
| `network_mcc` | Int32 | Mobile Country Code |
| `network_mnc` | Int32 | Mobile Network Code |
| `network_operator` | String | Operator display name |
| `network_iso` | String | Country ISO code (e.g., "il", "de") |
| `network_isRoaming` | Bool | True when device is on foreign network |
| `network_VPLMN` | String | Visited PLMN (when roaming) |
| `isRegistered` | Bool | False = unregistered/rogue cell |
| `signal_timingAdvance` | Int | GSM/LTE timing advance (0 = device appears at tower) |
| `signal_rsrp` | Float | Reference Signal Received Power (dBm) |
| `signal_txPower` | Float | Device transmit power (dBm) |
| `delta_no_signal` | Float | Duration (seconds) of signal loss event |
| `cell_pci` | Int | Physical Cell Identity |
| `cell_eci` | Nullable Int32 | E-UTRAN Cell Identifier — LTE cell ID (= eNB × 256 + sector) |
| `cell_enb` | Nullable Int32 | eNodeB ID — base station housing the LTE cell (= cell_eci / 256) |
| `cell_ecgi` | Nullable String | Global Cell ID — globally unique string (PLMN + ECI, e.g., "42501-12345") |
| `cell_nci` | Nullable Int64 | NR Cell Identity — 5G cell identifier |
| `cell_lac` | Nullable Int32 | Location Area Code — 2G/3G cell grouping |
| `cell_cid` | Nullable Int32 | Cell ID — 2G/3G cell identifier (use with cell_lac) |
| `deviceInfo_imsi` | String | IMSI — first 5 digits = home MCC+MNC |
| `deviceInfo_imei` | String | Device hardware identifier |
| `deviceInfo_personalId` | String | User-level identifier |
| `satellites_gps_satellitesNo` | Int | Number of GPS satellites visible |

> **Cell identity hierarchy:** `cell_ecgi` (globally unique, preferred) → `cell_eci` + `cell_enb` (LTE) → `cell_nci` (5G NR) → `cell_lac` + `cell_cid` (2G/3G). All queries now group and correlate by actual cell identity — not geographic tiles. Each anomaly result identifies a specific physical cell that can be looked up in operator cell databases.

---

## Anomaly Detection Types

---

### 1. Tech Downgrade (LTE → GSM)

**ID:** `tech_downgrade`

#### Threat Context
A rapid downgrade from LTE/NR to GSM is the hallmark indicator of an active IMSI-Catcher (Stingray) attack. These devices broadcast a strong GSM signal to force nearby handsets to abandon their LTE connection and attach to the rogue BTS on the insecure 2G channel. Once on GSM, the IMSI-Catcher can capture device identifiers and, in some configurations, intercept calls and SMS. The speed of the downgrade is diagnostic: under 2 minutes indicates an active forced downgrade; 2–15 minutes suggests soft jamming; over 15 minutes is more consistent with natural coverage gaps.

#### Full SQL Query
```sql
-- Tech Downgrade Detection (LTE → GSM)
-- CRITICAL < 2 min: IMSI-Catcher or jamming
-- HIGH 2-15 min: soft jamming or coverage degradation
-- LOW > 15 min: geographic blind spot
SELECT
    coalesce(nullIf(deviceInfo_personalId,''), nullIf(deviceInfo_imei,''), deviceInfo_deviceId) AS device_id,
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    minIf(toUnixTimestamp(timestamp), tech IN ('LTE','NR')) AS first_lte_ts,
    minIf(toUnixTimestamp(timestamp), tech = 'GSM')         AS first_gsm_ts,
    round((first_gsm_ts - first_lte_ts) / 60.0, 1)         AS minutes_lte_to_gsm,
    count()            AS counted,
    min(timestamp)     AS first_seen,
    max(timestamp)     AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE tech IN ('LTE', 'NR', 'GSM')
  -- ADD POLYGON FILTER HERE if needed:
  -- AND pointInPolygon(location_geo_coordinates, [(lon1,lat1),(lon2,lat2),...])
  -- ADD TIME FILTER HERE if needed:
  -- AND timestamp >= '2026-01-01 00:00:00'
GROUP BY device_id, cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING first_lte_ts > 0
   AND first_gsm_ts > 0
   AND first_gsm_ts > first_lte_ts
   AND minutes_lte_to_gsm <= 30   -- {max_minutes}: session window threshold
ORDER BY minutes_lte_to_gsm ASC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `max_minutes` | 30 | 1–120 | Maximum LTE→GSM transition window to include. Lower = more precise, fewer FP. |

#### Severity Tiers
| Condition | Severity | Label | Interpretation |
|-----------|----------|-------|----------------|
| `minutes_lte_to_gsm <= 2` | CRITICAL | IMSI Catcher / Active Jamming | Forced downgrade, active interception likely |
| `2 < minutes <= 15` | HIGH | Possible Soft Jamming | Coverage degradation or soft jamming |
| `minutes > 15` | LOW | Geographic Blind Spot | Natural coverage gap, not tactical |

#### False Positive Notes
- Rural areas with weak LTE infrastructure — devices naturally fall back to GSM
- Legacy Android/iOS builds with aggressive 2G fallback policies
- Underground or basement locations with LTE penetration issues
- **Mitigation:** Narrow `max_minutes` to ≤ 5 and correlate with TA=0 or Extreme RSRP

#### Correlate With
`timing_advance_zero`, `extreme_rsrp`, `pci_mismatch`, `unregistered_cells`

---

### 2. Timing Advance = 0

**ID:** `timing_advance_zero`

#### Threat Context
Timing Advance (TA) is a GSM/LTE mechanism that compensates for signal propagation delay based on distance from the tower. A legitimate device even 100 meters from a tower will have TA > 0. A TA value of exactly 0 means the network believes the device is physically co-located with the base station — an impossible condition for real devices. This is a direct fingerprint of IMSI-Catcher proximity spoofing: the rogue BTS assigns TA=0 to all attached devices to simplify its operation. All results are CRITICAL with no tier ambiguity.

#### Full SQL Query
```sql
-- Timing Advance = 0 Detection
-- ALL results: CRITICAL — distance spoofing by rogue BTS
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    countIf(signal_timingAdvance = 0) AS ta_zero_count,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE signal_timingAdvance IS NOT NULL
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING ta_zero_count >= 5   -- {min_count}: minimum TA=0 occurrences
ORDER BY ta_zero_count DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_count` | 5 | 1–50 | Minimum TA=0 events to qualify. Higher = fewer FP from device bugs. |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| Any result | CRITICAL | IMSI Catcher Proximity Spoofing |

#### False Positive Notes
- Some older Android devices report TA=0 as a default/unset value (firmware bug)
- Devices physically located at a cell tower site (maintenance vehicles)
- **Mitigation:** Raise `min_count` to 10+ and cross-reference with other anomaly types at the same tile

#### Correlate With
`tech_downgrade`, `extreme_rsrp`, `unregistered_cells`

---

### 3. Extreme RSRP

**ID:** `extreme_rsrp`

#### Threat Context
Reference Signal Received Power (RSRP) measures LTE/NR signal strength. Legitimate macro towers produce RSRP values typically between -70 and -120 dBm at normal distances. RSRP values above -50 dBm are physically impossible from a real macro tower (only achievable at centimeter range). IMSI-Catchers frequently broadcast at amplified power to dominate all nearby devices — producing RSRP values of -40 to -30 dBm or even higher. This is a high-precision indicator because legitimate infrastructure cannot produce these values.

#### Full SQL Query
```sql
-- Extreme RSRP Detection
-- CRITICAL >= -50 dBm: physically impossible for legitimate tower
-- HIGH < -50 dBm: abnormally high, investigate
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    round(avg(signal_rsrp), 1) AS avg_rsrp,
    max(signal_rsrp)           AS max_rsrp,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE signal_rsrp IS NOT NULL
  AND tech IN ('LTE', 'NR')
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING avg_rsrp >= -50   -- {rsrp_threshold}: minimum dBm threshold (recommend -50 to -40)
ORDER BY avg_rsrp DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `rsrp_threshold` | -50 | -80 to -30 (dBm) | Minimum avg RSRP to flag. -50 = CRITICAL tier; -70 = broader search |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `avg_rsrp >= -50 dBm` | CRITICAL | Rogue BTS — Abnormal Signal Power |
| `avg_rsrp < -50 dBm` | HIGH | Suspicious Signal Strength |

#### False Positive Notes
- Device physically located at or inside a legitimate microcell/picocell enclosure
- Carrier indoor distributed antenna systems (DAS) can produce high RSRP locally
- **Mitigation:** Cross-reference with cell database for known microcell locations; require `avg_rsrp >= -45`

#### Correlate With
`timing_advance_zero`, `tech_downgrade`, `tx_power_spike`

---

### 4. Unregistered Cells

**ID:** `unregistered_cells`

#### Threat Context
The `isRegistered` flag is set by the measurement platform when a cell's identity (MCC/MNC/CellID) cannot be found in the operator's official cell database. A cell that is physically transmitting but not registered in any licensed database is definitionally a rogue or pirate BTS. This is one of the most direct and unambiguous IMSI-Catcher indicators in the dataset — there is almost no legitimate explanation for an unregistered transmitting cell.

#### Full SQL Query
```sql
-- Unregistered Cell Detection
-- ALL results: CRITICAL — rogue or pirate base station
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE isRegistered = 0
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING counted >= 3   -- {min_samples}: minimum samples to reduce noise
ORDER BY counted DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_samples` | 3 | 1–100 | Minimum measurement count. Prevents single-reading noise. |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| Any result | CRITICAL | Rogue / Pirate Base Station |

#### False Positive Notes
- New cells that haven't been added to the operator database yet (rare, usually resolved within hours)
- Database sync lag during carrier infrastructure updates
- **False positive rate is very low** — this is the highest-confidence detection type

#### Correlate With
`timing_advance_zero`, `tech_downgrade`, `extreme_rsrp`, `pci_mismatch`

---

### 5. Forced Roaming

**ID:** `forced_roaming`

#### Threat Context
A device reporting roaming status while physically inside its home country is a strong indicator of a forced roaming attack. In this attack, the IMSI-Catcher or a rogue network configuration causes the device to register on a foreign partner network — routing calls and data through that foreign operator where they may be subject to interception under that country's legal framework. This is used to route communications through jurisdictions with different (or no) privacy protections.

#### Full SQL Query
```sql
-- Forced Roaming Detection
-- Devices showing network_isRoaming=1 while on home country MCC
-- HIGH: all results — forced roaming attack or misconfiguration
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE network_isRoaming = 1
  AND network_mcc = 425   -- {home_mcc}: home country MCC (425 = Israel)
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING counted >= 3
ORDER BY counted DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `home_mcc` | 425 | Text | Home country MCC. 425=Israel, 416=Jordan, 602=Egypt |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| Any result | HIGH | Forced Roaming Attack |

#### False Positive Notes
- Dual-SIM devices where the secondary SIM is from a foreign carrier
- MVNO subscribers whose virtual carrier is technically "foreign" in the network database
- Devices near borders picking up cross-border signals from neighboring countries
- **Mitigation:** Add a polygon filter to exclude border areas; cross-reference `network_PLMN` against known MVNO list

#### Correlate With
`tech_downgrade`, `pci_mismatch`, `multi_device_imei`

---

### 6. PCI Mismatch

**ID:** `pci_mismatch`

#### Threat Context
Physical Cell Identity (PCI) is a pseudo-random identifier assigned to each cell sector. In a stable network, a given location should see only the PCIs of the 2–3 towers that legitimately serve it. An IMSI-Catcher that cycles through PCI values to impersonate multiple legitimate towers — or to avoid detection — will create an anomalous pattern of many distinct PCIs at a single geographic tile. 5+ distinct PCIs at one location is consistent with tower impersonation; 2–4 may indicate a rotating IMSI-Catcher or adjacent legitimate towers.

#### Full SQL Query
```sql
-- PCI Mismatch Detection
-- CRITICAL >= 5 PCIs: tower impersonation / cycling
-- HIGH 2-4 PCIs: possible rogue transmitter
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    uniqExact(cell_pci)       AS distinct_pci_count,
    groupUniqArray(cell_pci)  AS pci_list,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE cell_pci IS NOT NULL
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING distinct_pci_count >= 3   -- {min_pci}: minimum distinct PCIs
ORDER BY distinct_pci_count DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_pci` | 3 | 2–20 | Minimum distinct PCIs at same tile to flag |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `distinct_pci_count >= 5` | CRITICAL | Tower Impersonation / PCI Cycling |
| `distinct_pci_count < 5` | HIGH | PCI Inconsistency |

#### False Positive Notes
- Dense urban areas where multiple towers serve the same tile legitimately
- Tower software upgrades temporarily cycling PCIs
- Tile boundaries where device moves between two cells
- **Mitigation:** Narrow `min_pci` to 5+ and require `counted >= 10` for reliability

#### Correlate With
`timing_advance_zero`, `extreme_rsrp`, `unregistered_cells`

---

### 7. Multi-Device IMEI

**ID:** `multi_device_imei`

#### Threat Context
An IMSI-Catcher harvests device identifiers (IMSI/IMEI) from all devices that attach to it. A location that shows an abnormally high count of unique device identifiers in a short time window is consistent with mass credential harvesting. While busy public locations (markets, stadiums) can legitimately show many devices, the combination of high device count + other anomaly indicators at the same tile is strong evidence of an active IMSI-Catcher.

#### Full SQL Query
```sql
-- Multi-Device IMEI/IMSI Detection
-- CRITICAL > 20 unique devices: mass credential harvesting
-- HIGH > 10: elevated density — possible surveillance
-- MEDIUM <= 10: inconclusive
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    uniqExact(coalesce(
        nullIf(deviceInfo_imei,''),
        nullIf(deviceInfo_personalId,''),
        deviceInfo_deviceId
    )) AS device_count,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE length(coalesce(
    nullIf(deviceInfo_imei,''),
    nullIf(deviceInfo_personalId,''),
    nullIf(deviceInfo_deviceId,'')
)) > 0
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING device_count >= 10   -- {min_devices}: minimum unique device count
ORDER BY device_count DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_devices` | 10 | 2–50 | Minimum unique device identifiers at tile |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `device_count > 20` | CRITICAL | Mass Credential Harvesting |
| `10 < device_count <= 20` | HIGH | Elevated Device Concentration |
| `device_count <= 10` | MEDIUM | Moderate Device Count |

#### False Positive Notes
- Shopping malls, markets, stadiums, transportation hubs
- **This anomaly should always be correlated** with other types before action — standalone it has high FP rate
- **Mitigation:** Use a narrow polygon (50–100m radius) and combine with time window filter

#### Correlate With
`timing_advance_zero`, `tech_downgrade`, `pci_mismatch`, `no_signal_blackout`

---

### 8. No-Signal Blackout

**ID:** `no_signal_blackout`

#### Threat Context
An RF jammer suppresses all cellular signal in its vicinity, causing devices to lose network connectivity entirely. The `delta_no_signal` field records the duration of complete signal loss events. Extended blackouts (> 5 minutes) in urban areas with good coverage indicate active jamming — a technique used alongside IMSI-Catchers to force devices off the legitimate network before directing them to the rogue BTS. Brief losses (< 1 minute) are common and benign.

#### Full SQL Query
```sql
-- No-Signal Blackout Detection
-- CRITICAL > 300s: active RF jamming zone
-- HIGH 60-300s: significant signal suppression
-- LOW < 60s: brief outage, likely benign
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    round(avg(delta_no_signal), 0) AS avg_blackout_seconds,
    max(delta_no_signal)           AS max_blackout_seconds,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE delta_no_signal IS NOT NULL
  AND delta_no_signal > 0
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING avg_blackout_seconds >= 120   -- {min_duration}: minimum average blackout in seconds
ORDER BY avg_blackout_seconds DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_duration` | 120 | 5–3600 (seconds) | Minimum average blackout duration to flag |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `avg_blackout_seconds > 300` | CRITICAL | Active RF Jamming Zone |
| `60 < avg_blackout_seconds <= 300` | HIGH | Significant Signal Blackout |
| `avg_blackout_seconds <= 60` | LOW | Brief Signal Loss |

#### False Positive Notes
- Tunnels, underground facilities, basements, parking structures
- Large steel-framed buildings with poor penetration
- Legitimate infrastructure maintenance windows (planned outages)
- **Mitigation:** Apply geographic filter to exclude known tunnels/indoor areas; require `counted >= 5`

#### Correlate With
`tech_downgrade`, `gps_satellite_drop`, `tx_power_spike`

---

### 9. TX Power Spike

**ID:** `tx_power_spike`

#### Threat Context
Devices automatically increase their transmit power when the network signal is weak, or when instructed by the base station. An IMSI-Catcher may deliberately degrade signal quality to force devices to transmit at high power (making them easier to track and intercept). Elevated device TX power in an area with otherwise good coverage is a secondary indicator of nearby jamming or rogue BTS interference. It is rarely definitive alone but strengthens correlation with other anomalies.

#### Full SQL Query
```sql
-- TX Power Spike Detection
-- CRITICAL > 25 dBm: device fighting a local jammer
-- HIGH <= 25 dBm: abnormally elevated TX
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    tech,
    round(avg(signal_txPower), 1) AS avg_tx_power,
    max(signal_txPower)           AS max_tx_power,
    round(avg(signal_rsrp), 1)   AS avg_rsrp,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE signal_txPower IS NOT NULL
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso, tech
HAVING avg_tx_power > 20   -- {tx_threshold}: minimum avg TX power in dBm
   AND count() > 5
ORDER BY avg_tx_power DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `tx_threshold` | 20 | 10–30 (dBm) | Minimum average TX power to flag |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `avg_tx_power > 25 dBm` | CRITICAL | Device Fighting Jammer |
| `avg_tx_power <= 25 dBm` | HIGH | Elevated TX Power |

#### False Positive Notes
- Vehicles in motion in poor coverage areas (motorways, rural zones)
- High floors of tall buildings with weak indoor signal
- Devices behind thick walls or in basements
- **Mitigation:** Cross-reference `avg_rsrp` — if RSRP is also poor, this is likely a coverage issue, not a jammer

#### Correlate With
`no_signal_blackout`, `extreme_rsrp`, `tech_downgrade`

---

### 10. GPS Satellite Drop

**ID:** `gps_satellite_drop`

#### Threat Context
GPS jammers are commonly deployed alongside IMSI-Catchers to prevent target devices from recording accurate location data. A sudden drop in the number of visible GPS satellites — especially indoors or in open areas — indicates active GPS interference. This anomaly is most significant when it co-occurs geographically with cellular anomalies: an area showing both no-signal blackout and GPS satellite drop is a high-confidence IMSI-Catcher deployment signature. GPS jamming is also used in military contexts for navigation disruption.

#### Full SQL Query
```sql
-- GPS Satellite Drop Detection
-- CRITICAL > 8 satellite drop: active GPS jamming zone
-- HIGH 4-8: GPS interference
-- MEDIUM < 4: variation, could be obstruction
SELECT
    cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid,
    network_PLMN,
    network_operator,
    network_iso,
    round(avg(satellites_gps_satellitesNo), 1) AS avg_satellites,
    min(satellites_gps_satellitesNo)            AS min_satellites,
    round(
        avg(satellites_gps_satellitesNo) - min(satellites_gps_satellitesNo),
        0
    ) AS satellite_drop,
    count()        AS counted,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE satellites_gps_satellitesNo IS NOT NULL
  AND satellites_gps_satellitesNo >= 0
  -- AND pointInPolygon(...)
  -- AND timestamp >= '...'
GROUP BY cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid, network_PLMN, network_operator, network_iso
HAVING satellite_drop >= 5   -- {min_drop}: minimum satellite count drop
   AND avg_satellites > 0
ORDER BY satellite_drop DESC
LIMIT 500;
```

#### Parameters
| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| `min_drop` | 5 | 2–12 | Minimum satellite count reduction to flag |

#### Severity Tiers
| Condition | Severity | Label |
|-----------|----------|-------|
| `satellite_drop > 8` | CRITICAL | GPS Jamming Zone |
| `4 <= satellite_drop <= 8` | HIGH | GPS Interference |
| `satellite_drop < 4` | MEDIUM | Satellite Count Variation |

#### False Positive Notes
- Indoor environments (shopping malls, office buildings, tunnels)
- Urban canyons with building shadowing
- Heavy cloud cover or atmospheric interference
- **Mitigation:** Apply to outdoor areas only; require `avg_satellites >= 4` as base

#### Correlate With
`no_signal_blackout`, `tech_downgrade`, `tx_power_spike`

---

## Roaming Intelligence Queries

### Devices Roaming Abroad from Home Operator

Use this to find subscribers from a specific home operator who have been detected on foreign networks.

```sql
-- Roaming Abroad — Home Operator Subscriber Detection
-- network_PLMN = home PLMN (e.g., '42501' = Partner Israel)
-- network_VPLMN = visited (roaming) PLMN
SELECT
    deviceInfo_imsi,
    coalesce(nullIf(deviceInfo_personalId,''), nullIf(deviceInfo_imei,''), deviceInfo_deviceId) AS device_id,
    network_PLMN     AS home_plmn,
    network_VPLMN    AS visited_plmn,
    network_operator AS visited_operator,
    network_iso      AS visited_country,
    network_mcc      AS visited_mcc,
    count()          AS counted,
    min(timestamp)   AS first_seen,
    max(timestamp)   AS last_seen,
    avg(location_geo_coordinates.2) AS lat,
    avg(location_geo_coordinates.1) AS lon
FROM measurements
WHERE network_isRoaming = 1
  AND network_PLMN LIKE '425%'   -- Change to '42501%' for Partner only
  -- AND timestamp >= '2026-01-01 00:00:00'
GROUP BY deviceInfo_imsi, device_id, home_plmn, visited_plmn, visited_operator, visited_country, visited_mcc
HAVING counted >= 3
ORDER BY counted DESC
LIMIT 1000;
```

### Country Distribution Summary

```sql
-- Country breakdown for home-operator roaming
SELECT
    network_iso      AS visited_country,
    network_mcc      AS visited_mcc,
    network_operator AS visited_operator,
    network_VPLMN    AS visited_plmn,
    count()          AS total_sessions,
    uniqExact(coalesce(
        nullIf(deviceInfo_personalId,''),
        nullIf(deviceInfo_imei,''),
        deviceInfo_deviceId
    )) AS unique_devices,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen
FROM measurements
WHERE network_isRoaming = 1
  AND network_PLMN LIKE '425%'
GROUP BY visited_country, visited_mcc, visited_operator, visited_plmn
ORDER BY unique_devices DESC
LIMIT 100;
```

---

## DB Insight Dashboard Queries

> **Platform:** `db-dashboard.html` — all 11 queries run in parallel on page load via `Promise.all()`.
> Time/source/ISO filters are appended dynamically as a `WHERE` clause (`timeWhere()` helper).
> Monthly growth query always runs **without** any time filter to capture full calendar months.

---

### KPI-1 · Totals (Wild Cards)

Populates the four top KPI cards: Total Samples, Unique Devices, Unique Cells, date range.

```sql
SELECT
    count()                                                          AS total,
    uniqExact(deviceInfo_deviceId)                                   AS devices,
    uniqExactIf(cell_ecgi, cell_ecgi IS NOT NULL AND cell_ecgi != '') AS cells,
    min(timestamp)                                                   AS first_seen,
    max(timestamp)                                                   AS last_seen
FROM measurements
-- WHERE <time / source / ISO filters>
```

| Output | KPI Card |
|--------|----------|
| `total` | Total Samples |
| `devices` | Unique Devices (by `deviceInfo_deviceId`) |
| `cells` | Unique Cells (ECGI — globally unique) |
| `first_seen` / `last_seen` | Date range sub-label |

---

### KPI-2 · Avg Monthly Growth (last 3 months)

Counts samples per calendar month for the current and previous 2 months. Always runs **without** a time filter so the monthly buckets reflect complete calendar months.

```sql
SELECT
    countIf(toYYYYMM(timestamp) = toYYYYMM(today()))                     AS m0,
    countIf(toYYYYMM(timestamp) = toYYYYMM(today() - INTERVAL 1 MONTH)) AS m1,
    countIf(toYYYYMM(timestamp) = toYYYYMM(today() - INTERVAL 2 MONTH)) AS m2,
    formatDateTime(today(), '%b %Y')                                     AS cur_month,
    formatDateTime(today() - INTERVAL 1 MONTH, '%b %Y')                 AS prev_month
FROM measurements
```

**Client-side growth formula:**
```
g1 = (m0 - m1) / m1 × 100   -- current vs. last month
g2 = (m1 - m2) / m2 × 100   -- last vs. two months ago
avgGrowth = (g1 + g2) / 2
```
Displayed with `trending_up` (green) or `trending_down` (red) icon.

---

### Dashboard-1 · Data Source Breakdown

SDK source distribution — who is contributing data to the database.

```sql
SELECT
    source,
    count()                        AS n,
    uniqExact(deviceInfo_deviceId) AS users
FROM measurements
-- WHERE <filters>
GROUP BY source
ORDER BY n DESC
LIMIT 15
```

Rendered as a table with Users, Samples, and a horizontal contribution bar (% of source total).

---

### Dashboard-2 · Technology Distribution

Sample breakdown by radio access technology.

```sql
SELECT
    tech,
    count() AS n
FROM measurements
-- WHERE <filters>
GROUP BY tech
ORDER BY n DESC
```

Color coding: NR = purple `#a78bfa`, LTE = blue `#3b82f6`, WCDMA = green `#22c55e`, GSM = orange `#f59e0b`.

---

### Dashboard-3 · Top Countries

Geographic distribution of measurements by country.

```sql
SELECT
    upper(network_iso)             AS country,
    count()                        AS n,
    uniqExact(network_operator)    AS ops
FROM measurements
-- WHERE <filters>
GROUP BY country
ORDER BY n DESC
LIMIT 15
```

Columns: Country ISO, Samples, Operator count, Share bar.

---

### Dashboard-4 · Top Operators

Per-operator breakdown, grouped by PLMN and technology to show multi-tech operators correctly.

```sql
SELECT
    network_operator AS operator,
    network_PLMN     AS plmn,
    tech,
    count()          AS n
FROM measurements
-- WHERE <filters>
GROUP BY operator, plmn, tech
ORDER BY n DESC
LIMIT 20
```

Client-side merges rows with the same `operator+plmn` key to sum samples and collect distinct techs as badges.

---

### Dashboard-5 · Signal Quality by Technology

Average signal metrics per radio technology for network quality assessment.

```sql
SELECT
    tech,
    round(avg(signal_rsrp), 1) AS avg_rsrp,
    round(avg(signal_rsrq), 1) AS avg_rsrq,
    round(avg(signal_snr),  1) AS avg_snr,
    count()                    AS n
FROM measurements
-- WHERE <filters>
WHERE signal_rsrp IS NOT NULL
GROUP BY tech
ORDER BY n DESC
```

| Column | Unit | Good Range |
|--------|------|------------|
| `avg_rsrp` | dBm | −80 to −100 = good LTE |
| `avg_rsrq` | dB | −10 to −15 = good |
| `avg_snr` | dB | > 10 = good |

---

### Dashboard-6 · Internet Speed by Operator + Tech

Average download/upload throughput and latency per operator per technology.

```sql
SELECT
    network_operator               AS operator,
    tech,
    round(avg(internet_downloadMbps), 1) AS dl,
    round(avg(internet_uploadMbps),   1) AS ul,
    round(avg(internet_latency),      0) AS latency,
    count()                             AS n
FROM measurements
-- WHERE <filters>
WHERE internet_downloadMbps IS NOT NULL
GROUP BY operator, tech
ORDER BY n DESC
LIMIT 15
```

Only rows with at least one speed test measurement (`internet_downloadMbps IS NOT NULL`) are included.

---

### Dashboard-7 · Band Distribution

Frequency band usage breakdown with duplex mode.

```sql
SELECT
    band_number,
    band_name,
    band_duplexMode AS duplex,
    count()         AS n
FROM measurements
-- WHERE <filters>
WHERE band_number IS NOT NULL
GROUP BY band_number, band_name, duplex
ORDER BY n DESC
LIMIT 15
```

Rendered as horizontal bars labeled `B{band_number} · {band_name} ({duplex})`.

---

### Dashboard-8 · Top Device Models

Most common device hardware models in the dataset.

```sql
SELECT
    deviceInfo_deviceModel AS model,
    count()                AS n
FROM measurements
-- WHERE <filters>
WHERE deviceInfo_deviceModel != ''
GROUP BY model
ORDER BY n DESC
LIMIT 12
```

---

### Dashboard-9 · Daily Activity (last 60 days)

Time-series histogram of measurement volume for trend visibility.

```sql
SELECT
    toDate(timestamp) AS day,
    count()           AS n
FROM measurements
-- WHERE <filters>
GROUP BY day
ORDER BY day ASC
LIMIT 60
```

Rendered as a bar chart with hover tooltips (`day: count`). Bar height is scaled relative to the daily maximum.

---

### Full Dashboard Execution Pattern

All 11 queries run in a single `Promise.all()` call. Each is wrapped in a `safe()` catch so one failed query does not block the rest:

```javascript
const [kpi, growth, bySource, byTech, byCountry,
       byOperator, signalQ, speedQ, byBand, byDevice, daily]
  = await Promise.all([
    safe(runQuery(KPI_SQL)),
    safe(runQuery(GROWTH_SQL)),   // no time filter
    safe(runQuery(SOURCE_SQL)),
    safe(runQuery(TECH_SQL)),
    safe(runQuery(COUNTRY_SQL)),
    safe(runQuery(OPERATOR_SQL)),
    safe(runQuery(SIGNAL_SQL)),
    safe(runQuery(SPEED_SQL)),
    safe(runQuery(BAND_SQL)),
    safe(runQuery(DEVICE_SQL)),
    safe(runQuery(DAILY_SQL)),
]);
```

---

## SQL Helper Patterns

### Polygon Filter (pointInPolygon)
Add to WHERE clause to restrict results to a drawn area:
```sql
AND pointInPolygon(location_geo_coordinates, [
    (34.7800, 32.0500),
    (34.8200, 32.0500),
    (34.8200, 32.0800),
    (34.7800, 32.0800)
])
-- Note: coordinate order is (longitude, latitude)
```

### Time Range Filter
```sql
AND timestamp >= '2026-03-01 00:00:00'
AND timestamp <= '2026-03-07 23:59:59'
```

### Device Identity (best-effort IMEI/IMSI fallback)
```sql
coalesce(
    nullIf(deviceInfo_personalId,''),
    nullIf(deviceInfo_imei,''),
    deviceInfo_deviceId
) AS device_id
```

### Cell Identity (best-effort — LTE preferred, fallback to NR / 2G-3G)
```sql
-- Best display label for a cell result row:
-- Priority: ECGI → ECI+eNB → NCI (5G) → LAC+CID (2G/3G)
CASE
    WHEN cell_ecgi  IS NOT NULL THEN cell_ecgi
    WHEN cell_eci   IS NOT NULL THEN concat(network_PLMN, '-ECI:', toString(cell_eci))
    WHEN cell_nci   IS NOT NULL THEN concat('NR:', toString(cell_nci))
    WHEN cell_lac   IS NOT NULL THEN concat('LAC:', toString(cell_lac), '/CID:', toString(cell_cid))
    ELSE '—'
END AS cell_label
```

---

## Confidence Score Methodology

The Anomaly Workbench computes a confidence score (0–100%) for each result row:

```
confidence = (sampleScore × 0.40) + (severityScore × 0.60)

sampleScore  = min(counted / 25, 1.0)    — 25+ samples = full credit
severityScore:
  CRITICAL → 1.00
  HIGH     → 0.70
  MEDIUM   → 0.45
  LOW      → 0.25
```

**Interpretation:**
- **≥ 70%** — High confidence: real anomaly, prioritize investigation
- **40–69%** — Medium confidence: verify with additional data sources
- **< 40%** — Low confidence: likely false positive, needs correlation

---

## Correlation Engine

When multiple anomaly types are run against the same dataset, the Anomaly Workbench automatically identifies **physical cells** (matched by `cell_ecgi` → `cell_eci`/`cell_enb` → `cell_nci` → `cell_lac`/`cell_cid`) that appear in 2 or more anomaly result sets. These **hotspot cells** are specific, actionable base stations — each result identifies a real cell that can be cross-referenced against operator cell databases (OCN, OpenCelliD, GSMA).

> **Architecture note:** `location_tileId_10` (geographic tile grouping) has been deprecated. All queries now group by actual cell identity columns. A "hotspot" is a specific physical cell, not a geographic area.

**Threat escalation by overlap count:**
- **2 anomaly types** at same cell → Elevated threat — investigate this specific ECI/ECGI
- **3 anomaly types** → Strong IMSI-Catcher profile — cross-reference with cell databases
- **4+ anomaly types** → Confirmed tactical deployment — immediate action recommended

**Recommended full-scan sequence (run all in Scan All mode):**
1. Tech Downgrade — baseline cellular threat
2. Timing Advance = 0 — proximity fingerprint
3. Unregistered Cells — direct rogue BTS indicator
4. Extreme RSRP — amplified signal anomaly
5. PCI Mismatch — tower impersonation
6. No-Signal Blackout — jamming zone
7. GPS Satellite Drop — GPS jamming correlation
8. TX Power Spike — device stress indicator
9. Multi-Device IMEI — harvesting signature
10. Forced Roaming — interception routing

---

## Operator Quick Reference (MCC Codes)

| MCC | Country | Significance |
|-----|---------|-------------|
| 425 | Israel | Home country |
| 416 | Jordan | Neighbor — border spillover normal |
| 602 | Egypt | Neighbor |
| 420 | Saudi Arabia | Neighbor |
| 432 | **Iran** | **HOSTILE — any detection = CRITICAL** |
| 417 | **Syria** | **HOSTILE** |
| 418 | **Iraq** | **HOSTILE** |
| 202 | Greece | European partner |
| 214 | Spain | European partner |

### Israeli Operators (PLMN)
| PLMN | Operator |
|------|---------|
| 42501 | Partner Communications |
| 42502 | Cellcom |
| 42503 | HOT Mobile |
| 42505 | Pelephone |
| 42508 | Golan Telecom |
| 42514 | Rami Levy |

---

---

## Architecture Change Log

| Version | Date | Change |
|---------|------|--------|
| v1.0 | Initial | Grouped by `location_tileId_10` (geographic tile ~10km²) |
| v2.0 | 2026-03-08 | **Deprecated `location_tileId_10`** — all 10 queries now group by `cell_eci, cell_enb, cell_ecgi, cell_nci, cell_lac, cell_cid`. Correlation engine matches on cell identity (ECGI priority). Each anomaly result now identifies a specific physical cell, not a geographic tile. |

*FCIC — Advanced Cell Report Platform | Internal Use Only | Handle per classification protocols*
