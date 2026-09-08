"""
KP — Seed top 30 NSE liquid stocks with 1-year OHLCV history.

Usage:
    python scripts/seed_top30.py          # ingest all 30 symbols
    python scripts/seed_top30.py --dry-run

Run this once after migration 002 to get RSI/MACD working for key stocks.
Data sourced exclusively from yfinance. Never fabricated.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

# Top 30 NSE liquid/index stocks (NIFTY50 heavyweights + F&O actives)
TOP_30 = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "HINDUNILVR", "ITC", "SBIN", "BAJFINANCE", "BHARTIARTL",
    "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT", "MARUTI",
    "SUNPHARMA", "TITAN", "ULTRACEMCO", "NESTLEIND", "WIPRO",
    "HCLTECH", "ONGC", "NTPC", "POWERGRID", "COALINDIA",
    "JSWSTEEL", "TATASTEEL", "INDUSINDBK", "TECHM", "ADANIENT",
]


async def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        print("DRY RUN — symbols that would be ingested:")
        for s in TOP_30:
            print(f"  {s}")
        print(f"\nTotal: {len(TOP_30)} symbols · period: 1y · interval: 1d")
        return

    # Delegate to ingest_ohlcv.py logic
    import subprocess
    print(f"\n=== KP Top-30 OHLCV Seed ===")
    print(f"Ingesting {len(TOP_30)} symbols, 1y daily bars each...\n")

    for i, sym in enumerate(TOP_30, 1):
        print(f"[{i:2d}/{len(TOP_30)}] {sym}...", end=" ", flush=True)
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "ingest_ohlcv.py"),
                "--symbol", sym,
                "--period", "1y",
            ],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            # Parse bars count from output
            for line in result.stdout.splitlines():
                if "Bars stored" in line:
                    bars = line.strip().split(":")[-1].strip()
                    print(f"OK  {bars} bars")
                    break
            else:
                print("OK")
        else:
            print(f"FAIL")
            if result.stderr:
                print(f"   {result.stderr.strip()[:120]}")

    print("\nSeed complete.")
    print("Run: python scripts/ingest_ohlcv.py --limit 0 --period 1y  to ingest all 2,583 stocks.")


if __name__ == "__main__":
    asyncio.run(main())
