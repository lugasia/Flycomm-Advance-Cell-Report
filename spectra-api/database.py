"""SQLAlchemy database setup — Vercel Neon Postgres in production, SQLite for local dev."""
import os
import ssl
from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ── Build engine ──────────────────────────────────────────────────
# Priority: POSTGRES_URL (Vercel Neon) > PG_HOST (manual) > DATABASE_URL > SQLite

_pg_url = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL")

if _pg_url:
    # Vercel/Supabase sets postgres:// — SQLAlchemy needs postgresql://
    if _pg_url.startswith("postgres://"):
        _pg_url = "postgresql://" + _pg_url[len("postgres://"):]
    # Switch to pg8000 driver (pure Python, works on Vercel)
    _pg_url = _pg_url.replace("postgresql://", "postgresql+pg8000://", 1)
    # Strip sslmode param (pg8000 uses ssl_context instead)
    _pg_url = _pg_url.split("?")[0]
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE
    engine = create_engine(_pg_url, pool_pre_ping=True,
                           connect_args={"ssl_context": _ssl_ctx})

elif os.getenv("PG_HOST"):
    _user = quote_plus(os.getenv("PG_USER", "postgres"))
    _password = quote_plus(os.getenv("PG_PASSWORD", ""))
    _host = os.getenv("PG_HOST")
    _port = os.getenv("PG_PORT", "5432")
    _db = os.getenv("PG_DB", "postgres")
    _url = f"postgresql+pg8000://{_user}:{_password}@{_host}:{_port}/{_db}"
    _ssl_ctx = ssl.create_default_context()
    engine = create_engine(_url, pool_pre_ping=True,
                           connect_args={"ssl_context": _ssl_ctx})

else:
    # Local SQLite fallback — /tmp on Vercel (read-only filesystem)
    _local_db = os.path.join(os.path.dirname(__file__), "spectra.db")
    _db_path = "/tmp/spectra.db" if os.getenv("VERCEL") else _local_db
    engine = create_engine(
        f"sqlite:///{_db_path}",
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_add_columns():
    """Add new columns to existing tables without dropping data."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)

        org_cols = {c["name"] for c in insp.get_columns("organizations")}
        if "is_demo" not in org_cols:
            conn.execute(text("ALTER TABLE organizations ADD COLUMN is_demo BOOLEAN DEFAULT false"))

        rsu_cols = {c["name"] for c in insp.get_columns("rsus")}
        if "manual_status" not in rsu_cols:
            conn.execute(text("ALTER TABLE rsus ADD COLUMN manual_status VARCHAR"))

        # ClickHouse connection fields per organization
        if "ch_host" not in org_cols:
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_host VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_port INTEGER DEFAULT 8443"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_db VARCHAR DEFAULT 'default'"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_user VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_password VARCHAR"))
            conn.execute(text("ALTER TABLE organizations ADD COLUMN ch_ssl BOOLEAN DEFAULT true"))

        conn.commit()
