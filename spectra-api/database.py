"""SQLAlchemy database setup — Supabase Postgres in production, SQLite for local dev."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Use Supabase Postgres if DATABASE_URL is set, otherwise fall back to local SQLite
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Supabase / Postgres
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    # SQLite fallback — /tmp on Vercel (read-only filesystem), local file otherwise
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

        # organizations.is_demo
        org_cols = {c["name"] for c in insp.get_columns("organizations")}
        if "is_demo" not in org_cols:
            conn.execute(text("ALTER TABLE organizations ADD COLUMN is_demo BOOLEAN DEFAULT false"))

        # rsus.manual_status
        rsu_cols = {c["name"] for c in insp.get_columns("rsus")}
        if "manual_status" not in rsu_cols:
            conn.execute(text("ALTER TABLE rsus ADD COLUMN manual_status VARCHAR"))

        conn.commit()
