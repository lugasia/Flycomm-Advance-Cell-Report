"""RSU endpoints — live data from ClickHouse (source='modem')."""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone
from clickhouse import run_query, run_query_one
from config import MODEM_SOURCE, IMEI_INDEX, RSU_FLEET

router = APIRouter(prefix="/api/rsus", tags=["rsus"])


def _status(last_seen_str: str | None) -> str:
    """Derive RSU online status from last heartbeat timestamp."""
    if not last_seen_str:
        return "offline"
    try:
        ts = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - ts).total_seconds()
        if age < 300:        return "online"
        elif age < 3600:     return "idle"
        else:                return "offline"
    except Exception:
        return "offline"


def _build_rsu(row: dict) -> dict:
    """Map a ClickHouse aggregate row to the RSU schema the React app expects."""
    imei  = row.get("imei", "")
    meta  = IMEI_INDEX.get(imei, {})
    last_seen = row.get("last_seen")

    return {
        "id":              imei,
        "device_id":       imei,
        "organization_id": "org-spectra",
        "cluster_id":      meta.get("cluster_id", ""),
        "latitude":        float(row.get("lat", meta.get("lat", 0))),
        "longitude":       float(row.get("lng", meta.get("lng", 0))),
        "location_name":   meta.get("location_name", imei),
        "status":          _status(last_seen),
        "firmware":        row.get("firmware", ""),
        "hardware_rev":    f"{meta.get('model', '')} / {row.get('modem_fw', '')}".strip(" /"),
        "uptime_hours":    round(int(row.get("max_uptime_sec", 0)) / 3600, 1),
        "last_heartbeat":  last_seen,
        "created_date":    row.get("first_seen"),
        # extended fields (Spectra-specific)
        "model":           meta.get("model", row.get("model", "")),
        "generation":      meta.get("generation", ""),
        "avg_temp_c":      float(row.get("avg_temp_c", 0)),
        "last_temp_c":     float(row.get("last_temp_c", 0)),
        "gps_accuracy_m":  float(row.get("gps_accuracy", 0) or 0),
        "gps_satellites":  int(row.get("gps_satellites", 0) or 0),
        "last_tech":       row.get("last_tech", ""),
        "last_operator":   row.get("last_operator", ""),
        "last_plmn":       row.get("last_plmn", ""),
        "last_rsrp":       int(row.get("last_rsrp", 0) or 0),
        "last_rsrq":       int(row.get("last_rsrq", 0) or 0) if row.get("last_rsrq") else None,
        "last_rssi":       int(row.get("last_rssi", 0) or 0) if row.get("last_rssi") else None,
        "last_band":       int(row.get("last_band", 0)) if row.get("last_band") else None,
        "total_samples":   int(row.get("total_samples", 0)),
    }


# ── SQL for full RSU summary ──────────────────────────────────────
_RSU_SUMMARY_SQL = """
SELECT
    deviceInfo_imei                                                 AS imei,
    deviceInfo_deviceModel                                          AS model,
    any(deviceInfo_deviceReleaseVersion)                            AS firmware,
    anyIf(deviceInfo_modemVersion, deviceInfo_modemVersion != '')   AS modem_fw,
    round(avg(deviceInfo_temperature), 1)                           AS avg_temp_c,
    round(argMax(deviceInfo_temperature, timestamp), 1)             AS last_temp_c,
    max(deviceInfo_uptime)                                          AS max_uptime_sec,
    min(timestamp)                                                  AS first_seen,
    max(timestamp)                                                  AS last_seen,
    count()                                                         AS total_samples,
    round(argMax(location_geo_coordinates.2, timestamp), 6)         AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6)         AS lng,
    argMax(location_accuracy, timestamp)                            AS gps_accuracy,
    argMax(satellites_gps_satellitesNo, timestamp)                  AS gps_satellites,
    argMax(tech, timestamp)                                         AS last_tech,
    argMax(network_operator, timestamp)                             AS last_operator,
    argMax(network_PLMN, timestamp)                                 AS last_plmn,
    argMax(signal_rsrp, timestamp)                                  AS last_rsrp,
    argMax(signal_rsrq, timestamp)                                  AS last_rsrq,
    argMax(signal_rssi, timestamp)                                  AS last_rssi,
    argMax(band_number, timestamp)                                  AS last_band
FROM measurements
WHERE source = 'modem'
  AND deviceInfo_imei != ''
GROUP BY imei, model
ORDER BY total_samples DESC
"""


@router.get("")
def list_rsus(
    cluster_id: str | None = Query(None),
    status: str | None = Query(None),
    organization_id: str | None = Query(None),
):
    """List all RSUs with live ClickHouse data."""
    try:
        rows = run_query(_RSU_SUMMARY_SQL)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Deduplicate by IMEI (keep highest sample count row)
    seen: dict[str, dict] = {}
    for row in rows:
        imei = row.get("imei", "")
        if imei not in seen or int(row.get("total_samples", 0)) > int(seen[imei].get("total_samples", 0)):
            seen[imei] = row

    rsus = [_build_rsu(r) for r in seen.values()]

    # Apply filters
    if cluster_id:
        rsus = [r for r in rsus if r["cluster_id"] == cluster_id]
    if status:
        rsus = [r for r in rsus if r["status"] == status]

    return rsus


@router.get("/{imei}")
def get_rsu(imei: str):
    """Get a single RSU by IMEI."""
    sql = _RSU_SUMMARY_SQL.replace(
        "WHERE source = 'modem'",
        f"WHERE source = 'modem' AND deviceInfo_imei = '{imei}'"
    )
    try:
        rows = run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not rows:
        # Return static data if IMEI is known but has no CH data
        meta = IMEI_INDEX.get(imei)
        if meta:
            return {**{k: None for k in ["firmware","modem_fw","avg_temp_c","last_temp_c",
                       "max_uptime_sec","first_seen","last_seen","total_samples",
                       "gps_accuracy","gps_satellites","last_tech","last_operator",
                       "last_plmn","last_rsrp","last_rsrq","last_rssi","last_band"]},
                    "id": imei, "device_id": imei, "organization_id": "org-spectra",
                    "cluster_id": meta["cluster_id"], "latitude": meta["lat"],
                    "longitude": meta["lng"], "location_name": meta["location_name"],
                    "status": "offline", "model": meta["model"], "generation": meta["generation"],
                    "total_samples": 0}
        raise HTTPException(status_code=404, detail="RSU not found")

    return _build_rsu(rows[0])


@router.get("/{imei}/signal")
def get_rsu_signal(
    imei: str,
    hours: int = Query(24, ge=1, le=720),
):
    """Signal quality history for one RSU (hourly averages)."""
    sql = f"""
SELECT
    toStartOfHour(timestamp)       AS hour,
    round(avg(signal_rsrp), 1)     AS rsrp,
    round(avg(signal_rsrq), 1)     AS rsrq,
    round(avg(signal_rssi), 1)     AS rssi,
    round(avg(signal_snr),  1)     AS snr,
    argMax(tech, timestamp)        AS tech,
    argMax(network_PLMN, timestamp) AS plmn,
    argMax(band_number, timestamp)  AS band,
    count()                        AS samples
FROM measurements
WHERE source = 'modem'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY hour
ORDER BY hour ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{imei}/cells")
def get_rsu_cells(imei: str):
    """Distinct cells seen by this RSU (last 30 days)."""
    sql = f"""
SELECT
    cell_eci                        AS eci,
    cell_pci                        AS pci,
    cell_tac                        AS tac,
    network_PLMN                    AS plmn,
    network_operator                AS operator,
    tech,
    band_number                     AS band,
    round(avg(signal_rsrp), 1)      AS avg_rsrp,
    count()                         AS n,
    max(timestamp)                  AS last_seen
FROM measurements
WHERE source = 'modem'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY eci, pci, tac, plmn, operator, tech, band
ORDER BY n DESC
LIMIT 50
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{imei}/gps")
def get_rsu_gps(imei: str, hours: int = Query(24, ge=1, le=720)):
    """GPS track for one RSU."""
    sql = f"""
SELECT
    toStartOfMinute(timestamp)                            AS minute,
    round(argMax(location_geo_coordinates.2, timestamp), 6) AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6) AS lng,
    round(avg(location_accuracy), 2)                      AS accuracy_m,
    argMax(satellites_gps_satellitesNo, timestamp)        AS gps_sats,
    round(avg(deviceInfo_temperature), 1)                 AS temp_c
FROM measurements
WHERE source = 'modem'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY minute
ORDER BY minute ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
