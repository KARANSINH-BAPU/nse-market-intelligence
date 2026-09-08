import asyncio
import asyncpg

DSN = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"

async def main():
    conn = await asyncpg.connect(DSN)

    cols = await conn.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'ohlcv_daily' ORDER BY ordinal_position"
    )
    print("ohlcv_daily columns:", [r["column_name"] for r in cols])

    total   = await conn.fetchval("SELECT COUNT(*) FROM ohlcv_daily")
    symbols = await conn.fetchval("SELECT COUNT(DISTINCT instrument_id) FROM ohlcv_daily")

    date_col = "ts" if any(r["column_name"] == "ts" for r in cols) else cols[1]["column_name"]
    latest   = await conn.fetchval(f"SELECT MAX({date_col}) FROM ohlcv_daily")
    oldest   = await conn.fetchval(f"SELECT MIN({date_col}) FROM ohlcv_daily")

    print(f"\n=== ohlcv_daily ===")
    print(f"Total bars   : {total:,}")
    print(f"Symbols w/ data: {symbols:,}")
    print(f"Date range   : {oldest} → {latest}")

    instruments = await conn.fetchval("SELECT COUNT(*) FROM instruments WHERE active = true")
    print(f"\n=== instruments ===")
    print(f"Active       : {instruments:,}")

    await conn.close()

asyncio.run(main())
