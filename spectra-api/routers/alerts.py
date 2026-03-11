"""Alert endpoints — anomalies computed from ClickHouse modem data."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone
from clickhouse import run_query
from config import IMEI_INDEX, MODEM_SOURCE
import uuid

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _severity_from_rsrp(rsrp: float) -> str:
    if rsrp <= -110:  return "critical"
    if rsrp <= -100:  return "high"
    if rsrp <= -90:   return "medium"
    return "low"


def _offline_alerts() -> list[dict]:
    """Generate 'RSU Offline' alerts for all known RSUs (last seen Feb 2026)."""
    sql = f"""
SELECT
    deviceInfo_imei                 AS imei,
    max(timestamp)                  AS last_seen,
    argMax(location_geo_coordinates.2, timestamp) AS lat,
    argMax(location_geo_coordinates.1, timestamp) AS lng,
    argMax(deviceInfo_deviceModel, timestamp)      AS model
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
GROUP BY imei
"""
    rows = run_query(sql)
    alerts = []
    for row in rows:
        imei     = row.get("imei", "")
        meta     = IMEI_INDEX.get(imei, {})
        last_seen = row.get("last_seen", "")
        try:
            ts = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
        except Exception:
            age_hours = 9999

        if age_hours > 1:
            alerts.append({
                "id":            f"offline-{imei}",
                "organization_id": "org-spectra",
                "rsu_id":        imei,
                "cluster_id":    meta.get("cluster_id", ""),
                "cluster_name":  meta.get("cluster_id", "").replace("-", " ").title(),
                "severity":      "high",
                "status":        "active",
                "type":          "RSU Offline",
                "latitude":      float(row.get("lat", meta.get("lat", 0))),
                "longitude":     float(row.get("lng", meta.get("lng", 0))),
                "device_id":     imei,
                "description":   f"RSU {meta.get('location_name', imei)} has not reported in "
                                 f"{int(age_hours):,} hours. Last heartbeat: {last_seen[:19].replace('T',' ')} UTC",
                "deviation_db":  None,
                "affected_band":  None,
                "confidence":    95,
                "created_date":  last_seen,
                "timestamp":     last_seen,
                "acknowledged_by": None,
                "resolved_at":   None,
            })
    return alerts


def _signal_anomaly_alerts() -> list[dict]:
    """Flag hours where avg RSRP dropped below -100 dBm (per RSU)."""
    sql = f"""
SELECT
    deviceInfo_imei                              AS imei,
    toStartOfHour(timestamp)                     AS hour,
    round(avg(signal_rsrp), 1)                   AS avg_rsrp,
    round(min(signal_rsrp), 1)                   AS min_rsrp,
    argMax(location_geo_coordinates.2, timestamp) AS lat,
    argMax(location_geo_coordinates.1, timestamp) AS lng,
    argMax(tech, timestamp)                       AS tech,
    argMax(band_number, timestamp)                AS band,
    argMax(network_PLMN, timestamp)               AS plmn,
    count()                                       AS n
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND signal_rsrp < -100
GROUP BY imei, hour
HAVING n >= 10
ORDER BY hour DESC, avg_rsrp ASC
LIMIT 30
"""
    rows = run_query(sql)
    alerts = []
    for row in rows:
        imei  = row.get("imei", "")
        meta  = IMEI_INDEX.get(imei, {})
        rsrp  = float(row.get("avg_rsrp", -100))
        hour  = row.get("hour", "")
        band  = row.get("band")
        alerts.append({
            "id":            f"sig-{imei}-{hour}",
            "organization_id": "org-spectra",
            "rsu_id":        imei,
            "cluster_id":    meta.get("cluster_id", ""),
            "cluster_name":  meta.get("cluster_id", "").replace("-", " ").title(),
            "severity":      _severity_from_rsrp(rsrp),
            "status":        "active",
            "type":          "Signal Degradation",
            "latitude":      float(row.get("lat", meta.get("lat", 0))),
            "longitude":     float(row.get("lng", meta.get("lng", 0))),
            "device_id":     imei,
            "description":   f"RSU {meta.get('location_name', imei)}: avg RSRP dropped to "
                             f"{rsrp} dBm (min {row.get('min_rsrp')} dBm) "
                             f"on {row.get('tech','')} B{band or '?'} PLMN {row.get('plmn','?')}",
            "deviation_db":  round(rsrp - (-74.9), 1),   # deviation from fleet avg
            "affected_band":  f"B{band}" if band else None,
            "confidence":    85,
            "created_date":  hour,
            "timestamp":     hour,
            "acknowledged_by": None,
            "resolved_at":   None,
        })
    return alerts


def _tac_anomaly_alerts() -> list[dict]:
    """Detect cells where multiple TAC values were seen (potential IMSI-catcher)."""
    sql = f"""
SELECT
    deviceInfo_imei                               AS imei,
    cell_eci                                      AS eci,
    groupArray(DISTINCT cell_tac)                 AS tac_list,
    uniq(cell_tac)                                AS tac_count,
    argMax(location_geo_coordinates.2, timestamp) AS lat,
    argMax(location_geo_coordinates.1, timestamp) AS lng,
    argMax(network_PLMN, timestamp)               AS plmn,
    argMax(tech, timestamp)                       AS tech,
    count()                                       AS n
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND cell_eci IS NOT NULL
  AND cell_tac IS NOT NULL
GROUP BY imei, eci
HAVING tac_count >= 2
ORDER BY tac_count DESC, n DESC
LIMIT 20
"""
    rows = run_query(sql)
    alerts = []
    for row in rows:
        imei      = row.get("imei", "")
        meta      = IMEI_INDEX.get(imei, {})
        eci       = row.get("eci")
        tac_count = int(row.get("tac_count", 2))
        tac_list  = row.get("tac_list", [])
        severity  = "critical" if tac_count >= 4 else "high"
        alerts.append({
            "id":            f"tac-{imei}-{eci}",
            "organization_id": "org-spectra",
            "rsu_id":        imei,
            "cluster_id":    meta.get("cluster_id", ""),
            "cluster_name":  meta.get("cluster_id", "").replace("-", " ").title(),
            "severity":      severity,
            "status":        "active",
            "type":          "TAC Anomaly — Possible IMSI Catcher",
            "latitude":      float(row.get("lat", meta.get("lat", 0))),
            "longitude":     float(row.get("lng", meta.get("lng", 0))),
            "device_id":     imei,
            "description":   f"Cell ECI {eci} (PLMN {row.get('plmn','?')}/{row.get('tech','?')}) "
                             f"observed with {tac_count} different TAC values: {tac_list}. "
                             f"Reported by {meta.get('location_name', imei)}. "
                             f"Tactical IMSI-catcher activity suspected.",
            "deviation_db":  None,
            "affected_band":  None,
            "confidence":    70 + min(tac_count * 5, 25),
            "created_date":  None,
            "timestamp":     None,
            "acknowledged_by": None,
            "resolved_at":   None,
        })
    return alerts


def _temp_alerts() -> list[dict]:
    """High temperature warnings per RSU."""
    sql = f"""
SELECT
    deviceInfo_imei                               AS imei,
    max(deviceInfo_temperature)                   AS max_temp,
    round(avg(deviceInfo_temperature), 1)         AS avg_temp,
    argMax(location_geo_coordinates.2, timestamp) AS lat,
    argMax(location_geo_coordinates.1, timestamp) AS lng,
    max(timestamp)                                AS last_seen
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND deviceInfo_temperature > 55
GROUP BY imei
ORDER BY max_temp DESC
"""
    rows = run_query(sql)
    alerts = []
    for row in rows:
        imei     = row.get("imei", "")
        meta     = IMEI_INDEX.get(imei, {})
        max_temp = float(row.get("max_temp", 0))
        alerts.append({
            "id":            f"temp-{imei}",
            "organization_id": "org-spectra",
            "rsu_id":        imei,
            "cluster_id":    meta.get("cluster_id", ""),
            "cluster_name":  meta.get("cluster_id", "").replace("-", " ").title(),
            "severity":      "critical" if max_temp >= 70 else "medium",
            "status":        "active",
            "type":          "Hardware Overtemperature",
            "latitude":      float(row.get("lat", meta.get("lat", 0))),
            "longitude":     float(row.get("lng", meta.get("lng", 0))),
            "device_id":     imei,
            "description":   f"RSU {meta.get('location_name', imei)} peaked at {max_temp}°C "
                             f"(avg {row.get('avg_temp')}°C). Hardware thermal limit may be exceeded.",
            "deviation_db":  None,
            "affected_band":  None,
            "confidence":    99,
            "created_date":  row.get("last_seen"),
            "timestamp":     row.get("last_seen"),
            "acknowledged_by": None,
            "resolved_at":   None,
        })
    return alerts


@router.get("")
def list_alerts(
    status: str | None = Query(None),
    severity: str | None = Query(None),
    organization_id: str | None = Query(None),
    cluster_id: str | None = Query(None),
    rsu_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """Return all computed anomaly alerts."""
    try:
        alerts: list[dict] = []
        alerts += _offline_alerts()
        alerts += _tac_anomaly_alerts()
        alerts += _signal_anomaly_alerts()
        alerts += _temp_alerts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Apply filters
    if status:
        alerts = [a for a in alerts if a.get("status") == status]
    if severity:
        alerts = [a for a in alerts if a.get("severity") == severity]
    if cluster_id:
        alerts = [a for a in alerts if a.get("cluster_id") == cluster_id]
    if rsu_id:
        alerts = [a for a in alerts if a.get("rsu_id") == rsu_id]

    # Sort: critical first, then high, then by timestamp desc
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    alerts.sort(key=lambda a: (order.get(a.get("severity", "low"), 4),
                               str(a.get("timestamp") or "")), reverse=False)

    return alerts[:limit]


@router.put("/{alert_id}")
def update_alert(alert_id: str, body: dict):
    """Acknowledge or resolve an alert (in-memory — ephemeral for now)."""
    # In a full implementation this would write to a DB table.
    # For now we just echo the update back.
    return {"id": alert_id, **body}
