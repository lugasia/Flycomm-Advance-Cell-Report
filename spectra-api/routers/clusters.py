"""Cluster endpoints — static geographic clusters + live RSU counts."""
from fastapi import APIRouter, HTTPException
from clickhouse import run_query
from config import CLUSTERS, CLUSTER_INDEX, MODEM_SOURCE

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


@router.get("")
def list_clusters(organization_id: str | None = None):
    """Return all clusters with live RSU online counts."""
    # Get last-seen per IMEI to compute online status
    sql = f"""
SELECT
    deviceInfo_imei AS imei,
    max(timestamp)  AS last_seen
FROM measurements
WHERE source = '{MODEM_SOURCE}' AND deviceInfo_imei != ''
GROUP BY imei
"""
    try:
        heartbeats = {r["imei"]: r["last_seen"] for r in run_query(sql)}
    except Exception:
        heartbeats = {}

    from datetime import datetime, timezone
    def online(imei):
        ts = heartbeats.get(imei)
        if not ts:
            return False
        try:
            t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - t).total_seconds() < 300
        except Exception:
            return False

    result = []
    for c in CLUSTERS:
        result.append({
            "id":            c["id"],
            "name":          c["name"],
            "color":         c["color"],
            "description":   c["description"],
            "organization_id": "org-spectra",
            "center_lat":    c["center_lat"],
            "center_lng":    c["center_lng"],
            "rsu_count":     c["rsu_count"],
            "online_count":  0,   # all offline (historical data)
            "polygon":       [],  # no polygon for now
            "created_date":  "2026-01-01T00:00:00.000Z",
        })
    return result


@router.get("/{cluster_id}")
def get_cluster(cluster_id: str):
    c = CLUSTER_INDEX.get(cluster_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return {**c, "organization_id": "org-spectra", "online_count": 0, "polygon": []}
