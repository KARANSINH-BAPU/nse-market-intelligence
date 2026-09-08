"""
KP — Bulk OHLCV History Ingestion Script

Downloads 1-year daily OHLCV bars for NSE equities from yfinance
and upserts into the ohlcv_daily table (migration 002).

Usage:
    python scripts/ingest_ohlcv.py                  # all instruments
    python scripts/ingest_ohlcv.py --limit 50       # first 50
    python scripts/ingest_ohlcv.py --symbol RELIANCE # single symbol
    python scripts/ingest_ohlcv.py --dry-run
    python scripts/ingest_ohlcv.py --period 6mo     # shorter lookback

Data sourced exclusively from yfinance — never fabricated.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import date as dt_date
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import asyncpg


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="KP OHLCV History Ingestion")
    p.add_argument("--symbol", help="Single NSE symbol to ingest")
    p.add_argument("--limit", type=int, default=0, help="Max symbols to process (0=all)")
    p.add_argument("--period", default="1y", help="yfinance period (1y, 6mo, 3mo, 1mo)")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--workers", type=int, default=5, help="Concurrent yfinance workers")
    p.add_argument("--db-url", default=None)
    return p.parse_args()


def _load_db_url(override: str | None) -> str:
    if override:
        return override
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    return "postgresql+asyncpg://kp_user:kp_dev_password@localhost:5432/kp_db"


async def _fetch_symbols(conn: asyncpg.Connection, limit: int) -> list[tuple[str, str]]:
    """Return list of (id, symbol) from instruments table."""
    sql = "SELECT id::text, symbol FROM instruments WHERE active = true ORDER BY symbol"
    if limit:
        sql += f" LIMIT {limit}"
    rows = await conn.fetch(sql)
    return [(r["id"], r["symbol"]) for r in rows]


async def _fetch_yf(symbol: str, period: str) -> list[dict]:
    """Download OHLCV from yfinance. Returns [] on failure."""
    try:
        import yfinance as yf
        loop = asyncio.get_event_loop()
        yf_sym = f"{symbol}.NS"

        hist = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: yf.Ticker(yf_sym).history(period=period, interval="1d", auto_adjust=True),
            ),
            timeout=20,
        )
        if hist is None or hist.empty:
            return []

        return [
            {
                "trade_date": ts.date(),  # pandas Timestamp → Python date object
                "open":   round(float(row["Open"]),  4),
                "high":   round(float(row["High"]),  4),
                "low":    round(float(row["Low"]),   4),
                "close":  round(float(row["Close"]), 4),
                "volume": int(row.get("Volume", 0)),
            }
            for ts, row in hist.iterrows()
        ]
    except Exception as e:
        return []


async def _upsert_bars(
    conn: asyncpg.Connection,
    instrument_id: str,
    symbol: str,
    bars: list[dict],
) -> int:
    """Upsert OHLCV bars into ohlcv_daily. Returns count inserted/updated."""
    if not bars:
        return 0

    # Use executemany for efficiency
    records = [
        (
            instrument_id,
            symbol,
            "NSE",
            bar["trade_date"],
            bar["open"],
            bar["high"],
            bar["low"],
            bar["close"],
            bar["volume"],
            "yfinance",
        )
        for bar in bars
    ]

    await conn.executemany(
        """
        INSERT INTO ohlcv_daily
            (instrument_id, symbol, exchange, trade_date, open, high, low, close, volume, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (symbol, exchange, trade_date)
        DO UPDATE SET
            open   = EXCLUDED.open,
            high   = EXCLUDED.high,
            low    = EXCLUDED.low,
            close  = EXCLUDED.close,
            volume = EXCLUDED.volume,
            source = EXCLUDED.source
        """,
        records,
    )
    return len(records)


async def main() -> None:
    args = _parse_args()
    db_url = _load_db_url(args.db_url)
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    print("\n=== KP OHLCV History Ingestion ===\n")
    print(f"Period   : {args.period}")
    print(f"Workers  : {args.workers}")
    print(f"Dry run  : {args.dry_run}")

    conn = await asyncpg.connect(pg_url)

    if args.symbol:
        symbols = [(None, args.symbol.upper())]
        # Get instrument ID
        row = await conn.fetchrow(
            "SELECT id::text FROM instruments WHERE symbol=$1 AND exchange='NSE'",
            args.symbol.upper(),
        )
        if row:
            symbols = [(row["id"], args.symbol.upper())]
        else:
            print(f"Symbol {args.symbol} not found in instruments table")
            await conn.close()
            return
    else:
        symbols = await _fetch_symbols(conn, args.limit)

    print(f"Symbols  : {len(symbols)}\n")

    if args.dry_run:
        print("DRY RUN — first 5 symbols:")
        for _, sym in symbols[:5]:
            print(f"  {sym}")
        print("\nDry run complete. No data written.")
        await conn.close()
        return

    # Semaphore to limit concurrency
    sem = asyncio.Semaphore(args.workers)
    total_bars = 0
    processed = 0
    errors = 0
    start = time.monotonic()

    async def process(instrument_id: str, symbol: str) -> None:
        nonlocal total_bars, processed, errors
        async with sem:
            bars = await _fetch_yf(symbol, args.period)
            if bars:
                count = await _upsert_bars(conn, instrument_id, symbol, bars)
                total_bars += count
            else:
                errors += 1
            processed += 1
            if processed % 50 == 0 or processed == len(symbols):
                pct = int(processed / len(symbols) * 100)
                print(f"\r  {pct}% ({processed}/{len(symbols)}) — {total_bars:,} bars, {errors} errors",
                      end="", flush=True)

    tasks = [process(iid, sym) for iid, sym in symbols]
    await asyncio.gather(*tasks)

    elapsed = time.monotonic() - start
    print(f"\n\nDone in {elapsed:.1f}s")
    print(f"  Processed : {processed:,} symbols")
    print(f"  Bars stored: {total_bars:,}")
    print(f"  Errors    : {errors}")
    print(f"  Rate      : {processed / elapsed:.1f} symbols/s")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
