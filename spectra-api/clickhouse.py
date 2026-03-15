"""ClickHouse HTTP client — uses httpx for Vercel TLS compatibility."""
from typing import Optional
from config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL


def _get_client():
    """Build an httpx client (lazy import so httpx is only needed when CH is used)."""
    import httpx
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.maximum_version = ssl.TLSVersion.TLSv1_2
    return httpx.Client(verify=ctx, timeout=30.0)


def run_query(sql: str) -> list[dict]:
    """Execute a ClickHouse SQL query, return rows as list of dicts."""
    protocol = "https" if CH_SSL else "http"
    url = f"{protocol}://{CH_HOST}:{CH_PORT}/"

    import base64
    creds = base64.b64encode(f"{CH_USER}:{CH_PASSWORD}".encode()).decode()

    client = _get_client()
    try:
        resp = client.post(
            url,
            params={"database": CH_DB, "default_format": "JSON"},
            content=sql.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "Authorization": f"Basic {creds}",
            },
        )
    finally:
        client.close()

    if resp.status_code != 200:
        raise RuntimeError(f"ClickHouse HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json().get("data", [])


def run_query_one(sql: str) -> Optional[dict]:
    """Return the first row or None."""
    rows = run_query(sql)
    return rows[0] if rows else None
