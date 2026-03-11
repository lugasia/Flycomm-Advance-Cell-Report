"""ClickHouse HTTP client — mirrors server.py pattern, no extra dependencies."""
import urllib.request
import urllib.parse
import urllib.error
import ssl
import json
import base64
from config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL


def run_query(sql: str) -> list[dict]:
    """Execute a ClickHouse SQL query, return rows as list of dicts."""
    params = urllib.parse.urlencode({
        "database": CH_DB,
        "default_format": "JSON",
    })
    protocol = "https" if CH_SSL else "http"
    url = f"{protocol}://{CH_HOST}:{CH_PORT}/?{params}"

    creds = base64.b64encode(f"{CH_USER}:{CH_PASSWORD}".encode()).decode()
    req = urllib.request.Request(
        url,
        data=sql.encode("utf-8"),
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "text/plain; charset=utf-8",
        },
        method="POST",
    )

    ctx = ssl.create_default_context() if CH_SSL else None
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = json.loads(resp.read())
            return data.get("data", [])
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"ClickHouse HTTP {e.code}: {err[:300]}")
    except Exception as e:
        raise RuntimeError(f"ClickHouse query failed: {e}")


def run_query_one(sql: str) -> dict | None:
    """Return the first row or None."""
    rows = run_query(sql)
    return rows[0] if rows else None
