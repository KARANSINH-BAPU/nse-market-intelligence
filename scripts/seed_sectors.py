"""
KP — Seed sectors from yfinance for known NSE stocks.

This script:
1. Fetches sector/industry info from yfinance for all stocks in instruments table
2. Upserts sector names into sectors table
3. Updates instruments.sector_id foreign key

Run once after OHLCV ingest to populate sector data.
Usage: python scripts/seed_sectors.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import asyncpg
import yfinance as yf

DB_DSN = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"


async def main():
    pool = await asyncpg.create_pool(DB_DSN, min_size=1, max_size=5)

    # Get all symbols
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id::text, symbol FROM instruments WHERE active = true ORDER BY symbol")

    print(f"Fetching sector info for {len(rows)} symbols from yfinance...")

    sector_map: dict[str, str] = {}  # sector_name -> sector_id (will be assigned)
    symbol_sector: dict[str, str] = {}  # symbol -> sector_name

    sem = asyncio.Semaphore(5)
    processed = 0
    errors = 0

    async def fetch_sector(inst_id: str, symbol: str):
        nonlocal processed, errors
        async with sem:
            try:
                ticker = yf.Ticker(f"{symbol}.NS")
                info = ticker.info
                sector = info.get("sector") or info.get("industry")
                if sector:
                    symbol_sector[symbol] = sector
                    if sector not in sector_map:
                        sector_map[sector] = sector
            except Exception:
                errors += 1
            processed += 1
            if processed % 100 == 0:
                print(f"  {processed}/{len(rows)} processed, {len(sector_map)} sectors found, {errors} errors")

    tasks = [fetch_sector(r["id"], r["symbol"]) for r in rows]
    await asyncio.gather(*tasks)

    print(f"\nFound {len(sector_map)} unique sectors for {len(symbol_sector)} symbols")

    if not sector_map:
        print("No sector data found — yfinance may not have sector info for these symbols")
        await pool.close()
        return

    # Upsert sectors
    async with pool.acquire() as conn:
        for sector_name in sector_map:
            existing_id = await conn.fetchval(
                "SELECT id::text FROM sectors WHERE name = $1", sector_name
            )
            if not existing_id:
                existing_id = await conn.fetchval(
                    "INSERT INTO sectors (name, nse_sector_name, created_at, updated_at) "
                    "VALUES ($1, $1, NOW(), NOW()) RETURNING id::text",
                    sector_name,
                )
            sector_map[sector_name] = existing_id  # type: ignore[assignment]

        # Update instruments
        updated = 0
        for r in rows:
            sym = r["symbol"]
            if sym in symbol_sector:
                sector_name = symbol_sector[sym]
                sector_id   = sector_map.get(sector_name)
                if sector_id:
                    await conn.execute(
                        "UPDATE instruments SET sector_id = $1::uuid WHERE id = $2::uuid",
                        sector_id, r["id"],
                    )
                    updated += 1

        print(f"Updated sector_id for {updated} instruments")

    await pool.close()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
