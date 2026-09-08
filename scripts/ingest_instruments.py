"""
KP — NSE Instrument Master Ingestion Script

Fetches the official NSE equity list from NSE's public endpoint and loads
it into the instruments table. Only uses real, publicly available data.

Source: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
This CSV is updated daily by NSE and is publicly accessible (no auth needed).

Usage:
    python scripts/ingest_instruments.py
    python scripts/ingest_instruments.py --dry-run
    python scripts/ingest_instruments.py --source bse  (future)
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend is on PYTHONPATH
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import httpx
import asyncpg


# ── Configuration ─────────────────────────────────────────────────
NSE_EQUITY_CSV_URL = (
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
)
NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://www.nseindia.com/",
}

# NSE CSV columns:
# SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE,
# MARKET LOT, ISIN NUMBER, FACE VALUE


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="KP NSE Instrument Ingestion")
    p.add_argument("--dry-run", action="store_true", help="Parse only, don't write to DB")
    p.add_argument("--limit", type=int, default=0, help="Limit rows (0=all)")
    p.add_argument("--db-url", default=None, help="Override DATABASE_URL")
    return p.parse_args()


def fetch_nse_equity_list() -> list[dict]:
    """Download NSE EQUITY_L.csv and parse it. Returns list of row dicts."""
    print(f"Fetching NSE equity list from:\n  {NSE_EQUITY_CSV_URL}")
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(NSE_EQUITY_CSV_URL, headers=NSE_HEADERS)
            resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"ERROR: Failed to download NSE equity list: {e}")
        print("If the NSE site is blocking requests, try again later or use a VPN.")
        sys.exit(1)

    content = resp.text
    print(f"Downloaded {len(content):,} bytes")

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    print(f"Parsed {len(rows):,} instruments")
    return rows


def map_row(row: dict) -> dict | None:
    """Map a raw NSE CSV row to an instruments table record."""
    symbol = row.get("SYMBOL", "").strip()
    if not symbol:
        return None

    series = row.get("SERIES", "").strip()
    # Only load equity series by default (EQ, BE, BL, SM, N, etc.)
    # Skip blank or invalid series
    if not series:
        series = "EQ"

    isin = row.get("ISIN NUMBER", "").strip() or None
    company_name = row.get("NAME OF COMPANY", "").strip() or None

    # Parse listing date
    listed_at = None
    date_str = row.get("DATE OF LISTING", "").strip()
    if date_str:
        for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                from datetime import date
                from datetime import datetime as dt
                listed_at = dt.strptime(date_str, fmt).date()
                break
            except ValueError:
                pass

    # Face value
    face_value = None
    fv_str = row.get("FACE VALUE", "").strip()
    if fv_str:
        try:
            face_value = float(fv_str)
        except ValueError:
            pass

    now = datetime.now(timezone.utc)

    return {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "company_name": company_name,
        "isin": isin,
        "exchange": "NSE",
        "instrument_type": "EQ",  # This list is equities only
        "active": True,
        "listed_at": listed_at,
        "delisted_at": None,
        "market_cap_category": None,  # Not available in this CSV
        "fno_eligible": False,  # F&O list sourced separately
        "provider_tokens": None,
        "meta": {
            "series": series,
            "face_value": face_value,
            "source": "nse_equity_l_csv",
        },
        "first_seen_at": now,
        "last_seen_at": now,
        "created_at": now,
        "updated_at": now,
    }


async def upsert_instruments(records: list[dict], db_url: str) -> tuple[int, int]:
    """
    Bulk upsert instruments into DB.
    ON CONFLICT (symbol, exchange) DO UPDATE.
    Returns (inserted, updated) counts.
    """
    import json

    # Convert asyncpg-compatible URL (no +asyncpg prefix)
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(pg_url)
    try:
        inserted = 0
        updated = 0

        # Process in batches of 500
        batch_size = 500
        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]

            for rec in batch:
                # asyncpg requires JSONB as JSON string
                meta_json = json.dumps(rec["meta"]) if rec["meta"] is not None else None
                tokens_json = json.dumps(rec["provider_tokens"]) if rec["provider_tokens"] is not None else None

                result = await conn.execute(
                    """
                    INSERT INTO instruments (
                        id, symbol, company_name, isin, exchange, instrument_type,
                        active, listed_at, delisted_at, market_cap_category,
                        fno_eligible, provider_tokens, meta,
                        first_seen_at, last_seen_at, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12, $13,
                        $14, $15, $16, $17
                    )
                    ON CONFLICT (symbol, exchange) DO UPDATE SET
                        company_name   = EXCLUDED.company_name,
                        isin           = COALESCE(EXCLUDED.isin, instruments.isin),
                        active         = EXCLUDED.active,
                        listed_at      = COALESCE(EXCLUDED.listed_at, instruments.listed_at),
                        meta           = instruments.meta || EXCLUDED.meta,
                        last_seen_at   = EXCLUDED.last_seen_at,
                        updated_at     = EXCLUDED.updated_at
                    """,
                    rec["id"],
                    rec["symbol"],
                    rec["company_name"],
                    rec["isin"],
                    rec["exchange"],
                    rec["instrument_type"],
                    rec["active"],
                    rec["listed_at"],
                    rec["delisted_at"],
                    rec["market_cap_category"],
                    rec["fno_eligible"],
                    tokens_json,
                    meta_json,
                    rec["first_seen_at"],
                    rec["last_seen_at"],
                    rec["created_at"],
                    rec["updated_at"],
                )
                if "INSERT 0 1" in result:
                    inserted += 1
                else:
                    updated += 1

            pct = min(100, int((i + len(batch)) / len(records) * 100))
            print(f"\r  Progress: {pct}% ({i + len(batch):,}/{len(records):,})", end="", flush=True)

        print()
        return inserted, updated

    finally:
        await conn.close()


async def main() -> None:
    args = parse_args()

    print("\n=== KP NSE Instrument Ingestion ===\n")

    # Load DB URL
    db_url = args.db_url
    if not db_url:
        # Load from .env
        env_file = ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip()
                    break
    if not db_url:
        db_url = "postgresql+asyncpg://kp_user:kp_dev_password@localhost:5432/kp_db"

    print(f"Database: {db_url.split('@')[1] if '@' in db_url else db_url}")

    # Fetch and parse
    raw_rows = fetch_nse_equity_list()

    if args.limit:
        raw_rows = raw_rows[: args.limit]
        print(f"Limited to {args.limit} rows")

    # Map rows
    records = []
    skipped = 0
    for row in raw_rows:
        mapped = map_row(row)
        if mapped:
            records.append(mapped)
        else:
            skipped += 1

    print(f"Mapped: {len(records):,} records ({skipped} skipped)")

    if args.dry_run:
        print("\nDRY RUN — first 3 records:")
        for r in records[:3]:
            print(f"  {r['symbol']:15} {r['company_name']}")
        print("\nDry run complete. No data written.")
        return

    # Upsert into DB
    print(f"\nUpserting {len(records):,} records into instruments table...")
    import asyncio

    start = time.monotonic()
    inserted, updated = await upsert_instruments(records, db_url)
    elapsed = time.monotonic() - start

    print(f"\nDone in {elapsed:.1f}s")
    print(f"  Inserted: {inserted:,}")
    print(f"  Updated:  {updated:,}")
    print(f"  Total:    {inserted + updated:,}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
