#!/bin/bash
# ── Spectra API — quick start ─────────────────────────────────────
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo ""
    echo "  .env not found — copy .env.example and fill in your ClickHouse credentials:"
    echo "  cp .env.example .env"
    echo ""
    exit 1
fi

if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "  Installing dependencies..."
    pip3 install -r requirements.txt
fi

echo ""
echo "  Spectra API starting on http://localhost:8001"
echo "  Docs: http://localhost:8001/docs"
echo "  Health: http://localhost:8001/api/health/clickhouse"
echo ""
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
