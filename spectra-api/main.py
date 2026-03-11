"""
Spectra API — FastAPI backend for Spectra Tactical View.

Replaces the Base44 cloud SDK with a local Python API
that reads RSU/modem data directly from ClickHouse.

Usage:
    cd spectra-api
    pip install -r requirements.txt
    cp .env.example .env   # fill in ClickHouse credentials
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import SUPER_ADMIN, DEFAULT_ORG

from routers import rsus, alerts, clusters, dashboard

app = FastAPI(
    title="Spectra API",
    description="RSU Intelligence Platform — ClickHouse backend",
    version="1.0.0",
)

# ── CORS — allow Vite dev server + production ────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174",
                   "http://localhost:3000", "http://localhost:8000",
                   "https://*.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────
app.include_router(rsus.router)
app.include_router(alerts.router)
app.include_router(clusters.router)
app.include_router(dashboard.router)


# ── Auth endpoints (hardcoded super-admin — Phase 1) ─────────────
@app.get("/api/auth/me")
def get_me():
    """Return the current authenticated user (super admin, Phase 1)."""
    return SUPER_ADMIN


@app.post("/api/auth/logout")
def logout():
    return {"ok": True}


# ── Organizations ─────────────────────────────────────────────────
@app.get("/api/organizations")
def list_orgs():
    return [DEFAULT_ORG]


@app.get("/api/organizations/{org_id}")
def get_org(org_id: str):
    return DEFAULT_ORG


# ── Health check ──────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "spectra-api", "version": "1.0.0"}


# ── ClickHouse connectivity test ──────────────────────────────────
@app.get("/api/health/clickhouse")
def health_clickhouse():
    from clickhouse import run_query_one
    try:
        row = run_query_one("SELECT 1 AS ok")
        return {"status": "connected", "clickhouse": "ok", "result": row}
    except Exception as e:
        return {"status": "error", "clickhouse": str(e)}
