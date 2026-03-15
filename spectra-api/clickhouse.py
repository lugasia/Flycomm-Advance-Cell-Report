"""ClickHouse HTTP client — uses requests with custom TLS for Vercel compatibility."""
from typing import Optional
import ssl
import urllib3
import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class _TLSAdapter(HTTPAdapter):
    """Force TLS 1.2 — Vercel's OpenSSL has handshake issues with ClickHouse Cloud."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


_session = http_requests.Session()
_session.mount("https://", _TLSAdapter())


def run_query(sql: str) -> list[dict]:
    """Execute a ClickHouse SQL query, return rows as list of dicts."""
    protocol = "https" if CH_SSL else "http"
    url = f"{protocol}://{CH_HOST}:{CH_PORT}/"

    resp = _session.post(
        url,
        params={"database": CH_DB, "default_format": "JSON"},
        data=sql.encode("utf-8"),
        auth=(CH_USER, CH_PASSWORD),
        headers={"Content-Type": "text/plain; charset=utf-8"},
        timeout=30,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"ClickHouse HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json().get("data", [])


def run_query_one(sql: str) -> Optional[dict]:
    """Return the first row or None."""
    rows = run_query(sql)
    return rows[0] if rows else None
