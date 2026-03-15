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
import uuid
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import Organization
from seed import init_db

from routers import rsus, alerts, clusters, dashboard, timeline, auth

app = FastAPI(
    title="Spectra API",
    description="RSU Intelligence Platform — ClickHouse backend",
    version="1.0.0",
)

# Seed tables + initial data on startup
init_db()

# ── CORS — allow Vite dev server + production ────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174",
                   "http://localhost:3000", "http://localhost:8000",
                   "https://*.vercel.app", "https://soc.flycomm.co"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────
app.include_router(rsus.router)
app.include_router(alerts.router)
app.include_router(clusters.router)
app.include_router(dashboard.router)
app.include_router(timeline.router)
app.include_router(auth.router)


# ── Organization models ────────────────────────────────────────────
class OrgCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    plan_tier: Optional[str] = "standard"
    max_rsus: Optional[int] = 10

class OrgUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    plan_tier: Optional[str] = None
    max_rsus: Optional[int] = None
    is_demo: Optional[bool] = None

def _org_dict(o: Organization) -> dict:
    return {"id": o.id, "name": o.name, "slug": o.slug,
            "plan_tier": o.plan_tier, "max_rsus": o.max_rsus,
            "is_demo": bool(o.is_demo)}


# ── Organizations CRUD (SQLite) ────────────────────────────────────
@app.get("/api/organizations")
def list_orgs(id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Organization)
    if id:
        q = q.filter_by(id=id)
    return [_org_dict(o) for o in q.all()]


@app.post("/api/organizations")
def create_org(body: OrgCreate, db: Session = Depends(get_db)):
    slug = body.slug or body.name.lower().replace(" ", "-")
    if db.query(Organization).filter_by(slug=slug).first():
        raise HTTPException(status_code=409, detail=f"Slug '{slug}' already exists")
    o = Organization(id=str(uuid.uuid4()), name=body.name, slug=slug,
                     plan_tier=body.plan_tier, max_rsus=body.max_rsus)
    db.add(o)
    db.commit()
    db.refresh(o)
    return _org_dict(o)


@app.get("/api/organizations/{org_id}")
def get_org(org_id: str, db: Session = Depends(get_db)):
    o = db.query(Organization).filter_by(id=org_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Organization not found")
    return _org_dict(o)


@app.put("/api/organizations/{org_id}")
def update_org(org_id: str, body: OrgUpdate, db: Session = Depends(get_db)):
    o = db.query(Organization).filter_by(id=org_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Organization not found")
    if body.name      is not None: o.name      = body.name
    if body.slug      is not None: o.slug      = body.slug
    if body.plan_tier is not None: o.plan_tier = body.plan_tier
    if body.max_rsus  is not None: o.max_rsus  = body.max_rsus
    if body.is_demo   is not None: o.is_demo   = body.is_demo
    db.commit()
    db.refresh(o)
    return _org_dict(o)


@app.delete("/api/organizations/{org_id}")
def delete_org(org_id: str, db: Session = Depends(get_db)):
    o = db.query(Organization).filter_by(id=org_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Organization not found")
    db.delete(o)
    db.commit()
    return {"ok": True, "id": org_id}


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
