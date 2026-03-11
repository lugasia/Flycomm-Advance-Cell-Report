"""Dashboard KPI endpoints."""
from fastapi import APIRouter, HTTPException
from clickhouse import run_query, run_query_one
from config import MODEM_SOURCE, RSU_FLEET

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def get_kpis():
    """Fleet-wide KPI summary for the Spectra dashboard header."""
    sql = f"""
SELECT
    count()                                       AS total_samples,
    uniq(deviceInfo_imei)                         AS total_rsus,
    round(avg(signal_rsrp), 1)                    AS fleet_avg_rsrp,
    round(avg(deviceInfo_temperature), 1)         AS fleet_avg_temp,
    countIf(signal_rsrp < -100)                   AS weak_signal_rows,
    uniq(cell_eci)                                AS unique_cells,
    uniq(network_PLMN)                            AS unique_operators,
    min(timestamp)                                AS data_from,
    max(timestamp)                                AS data_to
FROM measurements
WHERE source = '{MODEM_SOURCE}'
"""
    try:
        row = run_query_one(sql) or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "total_samples":    int(row.get("total_samples", 0)),
        "total_rsus":       int(row.get("total_rsus", 0)),
        "fleet_avg_rsrp":   float(row.get("fleet_avg_rsrp", 0)),
        "fleet_avg_temp":   float(row.get("fleet_avg_temp", 0)),
        "weak_signal_pct":  round(int(row.get("weak_signal_rows", 0)) /
                                  max(int(row.get("total_samples", 1)), 1) * 100, 1),
        "unique_cells":     int(row.get("unique_cells", 0)),
        "unique_operators": int(row.get("unique_operators", 0)),
        "data_from":        row.get("data_from"),
        "data_to":          row.get("data_to"),
        "rsus_configured":  len(RSU_FLEET),
        "rsus_online":      0,   # all offline — historical data
    }


@router.get("/signal-timeline")
def signal_timeline(imei: str | None = None, days: int = 30):
    """Daily average RSRP per RSU for timeline chart."""
    imei_filter = f"AND deviceInfo_imei = '{imei}'" if imei else ""
    sql = f"""
SELECT
    toDate(timestamp)               AS day,
    deviceInfo_imei                 AS imei,
    round(avg(signal_rsrp), 1)      AS avg_rsrp,
    round(min(signal_rsrp), 1)      AS min_rsrp,
    round(avg(signal_rssi), 1)      AS avg_rssi,
    count()                         AS samples
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND timestamp >= now() - INTERVAL {days} DAY
  {imei_filter}
GROUP BY day, imei
ORDER BY day ASC, imei ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tech-distribution")
def tech_distribution():
    """Tech split across all modem rows."""
    sql = f"""
SELECT
    tech,
    count()                         AS n,
    round(avg(signal_rsrp), 1)      AS avg_rsrp,
    round(avg(signal_rssi), 1)      AS avg_rssi,
    uniq(network_PLMN)              AS operators,
    uniq(cell_eci)                  AS cells
FROM measurements
WHERE source = '{MODEM_SOURCE}'
GROUP BY tech
ORDER BY n DESC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/operator-breakdown")
def operator_breakdown():
    """Measurements by operator (PLMN)."""
    sql = f"""
SELECT
    network_PLMN                    AS plmn,
    network_operator                AS operator,
    network_mcc                     AS mcc,
    tech,
    count()                         AS n,
    round(avg(signal_rsrp), 1)      AS avg_rsrp,
    uniq(deviceInfo_imei)           AS rsus
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND network_PLMN != ''
GROUP BY plmn, operator, mcc, tech
ORDER BY n DESC
LIMIT 20
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/satellite-health")
def satellite_health():
    """Daily average GPS satellite count and accuracy."""
    sql = f"""
SELECT
    toDate(timestamp)                               AS day,
    deviceInfo_imei                                 AS imei,
    round(avg(satellites_gps_satellitesNo), 1)      AS avg_gps_sats,
    round(avg(satellites_glonass_satellitesNo), 1)  AS avg_glonass_sats,
    round(avg(location_accuracy), 2)                AS avg_accuracy_m,
    count()                                         AS samples
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND satellites_gps_satellitesNo IS NOT NULL
GROUP BY day, imei
ORDER BY day ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
