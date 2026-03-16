"""ClickHouse connection config — reads from .env file."""
import os
from dotenv import load_dotenv

load_dotenv()

CH_HOST     = os.getenv("CH_HOST", "localhost")
CH_PORT     = int(os.getenv("CH_PORT", "8443"))
CH_DB       = os.getenv("CH_DB", "default")
CH_USER     = os.getenv("CH_USER", "default")
CH_PASSWORD = os.getenv("CH_PASSWORD", "")
CH_SSL      = os.getenv("CH_SSL", "true").lower() == "true"

# Source filter — only modem/RSU data
MODEM_SOURCE = "modem"

# ── Known RSU fleet ──────────────────────────────────────────────
# Derived from: SELECT deviceInfo_imei, ... FROM measurements WHERE source='modem'
RSU_FLEET = [
    {
        "imei": "860302050770881",
        "model": "RUTX5000",
        "generation": "5G",
        "location_name": "Arava South — Unit 1",
        "cluster_id": "arava-south",
        "lat": 30.485800,
        "lng": 35.175108,
    },
    {
        "imei": "860302050766871",
        "model": "RUTX5000",
        "generation": "5G",
        "location_name": "Arava South — Unit 2",
        "cluster_id": "arava-south",
        "lat": 30.485813,
        "lng": 35.175098,
    },
    {
        "imei": "868759034997975",
        "model": "RUTX1200",
        "generation": "4G",
        "location_name": "Northern Galilee — Unit 1",
        "cluster_id": "galilee-north",
        "lat": 32.785629,
        "lng": 35.543168,
    },
    {
        "imei": "868759034998064",
        "model": "RUTX1200",
        "generation": "4G",
        "location_name": "Northern Galilee — Unit 2",
        "cluster_id": "galilee-north",
        "lat": 32.785629,
        "lng": 35.543168,
    },
    {
        "imei": "860302050782860",
        "model": "RUTX5000",
        "generation": "5G",
        "location_name": "Jerusalem Region — Unit 1",
        "cluster_id": "jerusalem",
        "lat": 31.765887,
        "lng": 35.191338,
    },
    {
        "imei": "868759035016445",
        "model": "RUTX1200",
        "generation": "4G",
        "location_name": "Jerusalem Region — Unit 2",
        "cluster_id": "jerusalem",
        "lat": 31.766043,
        "lng": 35.191338,
    },
    {
        "imei": "868759034992539",
        "model": "RUTX1200",
        "generation": "4G",
        "location_name": "Jerusalem Region — Unit 3",
        "cluster_id": "jerusalem",
        "lat": 31.766043,
        "lng": 35.191338,
    },
]

IMEI_INDEX = {r["imei"]: r for r in RSU_FLEET}

# ── Static clusters ──────────────────────────────────────────────
CLUSTERS = [
    {
        "id": "arava-south",
        "name": "Arava South",
        "color": "#3b82f6",
        "description": "Southern Arava region — 2× RUTX5000 (5G)",
        "center_lat": 30.485806,
        "center_lng": 35.175103,
        "rsu_count": 2,
    },
    {
        "id": "galilee-north",
        "name": "Northern Galilee",
        "color": "#10b981",
        "description": "Northern Galilee region — 2× RUTX1200 (4G)",
        "center_lat": 32.785629,
        "center_lng": 35.543168,
        "rsu_count": 2,
    },
    {
        "id": "jerusalem",
        "name": "Jerusalem Region",
        "color": "#f59e0b",
        "description": "Jerusalem metropolitan area — 1× RUTX5000 + 2× RUTX1200",
        "center_lat": 31.765965,
        "center_lng": 35.191338,
        "rsu_count": 3,
    },
]

CLUSTER_INDEX = {c["id"]: c for c in CLUSTERS}

# ── Auth config (Supabase) ─────────────────────────────────────────
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
JWT_ALGORITHM = "HS256"

# Super admin emails — these users get is_super_admin=True on first login
SUPER_ADMIN_EMAILS = ["amir@flycomm.co"]

# Seed super admin
SUPER_ADMIN = {
    "id": "superadmin-001",
    "email": "amir@flycomm.co",
    "full_name": "Amir Lugasi",
    "organization_id": "org-spectra",
    "is_super_admin": True,
    "role": "admin",
    "custom_role": "admin",
}

DEFAULT_ORG = {
    "id": "org-spectra",
    "name": "Spectra Operations",
    "is_demo": False,
}
