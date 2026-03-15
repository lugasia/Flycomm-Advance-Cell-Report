"""SQLAlchemy ORM models for Spectra app data.

ClickHouse = read-only measurements source.
SQLite (this file) = app management data: orgs, users, RSU registry, clusters, alert acks.
"""
import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, Text
from sqlalchemy.sql import func
from database import Base


def _uuid():
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id           = Column(String, primary_key=True, default=_uuid)
    name         = Column(String, nullable=False)
    slug         = Column(String, unique=True)
    plan_tier    = Column(String, default="standard")   # free | standard | pro
    max_rsus     = Column(Integer, default=10)
    is_demo      = Column(Boolean, default=False)
    created_at   = Column(DateTime, server_default=func.now())

    # ClickHouse connection (per-org, browser-side queries)
    ch_host      = Column(String)       # e.g. "xyz.clickhouse.cloud"
    ch_port      = Column(Integer, default=8443)
    ch_db        = Column(String, default="default")
    ch_user      = Column(String)
    ch_password  = Column(String)       # stored encrypted in production
    ch_ssl       = Column(Boolean, default=True)


class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True, default=_uuid)
    email           = Column(String, unique=True, nullable=False)
    full_name       = Column(String)
    organization_id = Column(String)
    role            = Column(String, default="viewer")   # admin | operator | viewer
    is_super_admin  = Column(Boolean, default=False)
    created_at      = Column(DateTime, server_default=func.now())


class RSURecord(Base):
    """Registered RSU metadata (links an IMEI to an org/cluster)."""
    __tablename__ = "rsus"

    id              = Column(String, primary_key=True, default=_uuid)
    imei            = Column(String, unique=True, nullable=False)
    model           = Column(String)
    generation      = Column(String)
    location_name   = Column(String)
    cluster_id      = Column(String)
    organization_id = Column(String)
    lat             = Column(Float)
    lng             = Column(Float)
    is_active       = Column(Boolean, default=True)
    manual_status   = Column(String)   # override: online | offline | error | None
    notes           = Column(Text)
    registered_at   = Column(DateTime, server_default=func.now())


class Cluster(Base):
    __tablename__ = "clusters"

    id              = Column(String, primary_key=True)
    name            = Column(String, nullable=False)
    organization_id = Column(String)
    lat             = Column(Float)
    lng             = Column(Float)
    description     = Column(Text)
    color           = Column(String, default="#3b82f6")
    polygon_json    = Column(Text)   # JSON array of [lon, lat] pairs
    created_at      = Column(DateTime, server_default=func.now())


class AlertAck(Base):
    """Tracks which alerts have been acknowledged and by whom."""
    __tablename__ = "alert_acks"

    id               = Column(String, primary_key=True, default=_uuid)
    alert_hash       = Column(String, unique=True, nullable=False)
    acknowledged_by  = Column(String)
    acknowledged_at  = Column(DateTime, server_default=func.now())
    notes            = Column(Text)
