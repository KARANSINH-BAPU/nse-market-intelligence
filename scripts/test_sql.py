import asyncio
import asyncpg

DB = "postgresql://kp_user:kp_dev_password@localhost:5432/kp_db"

async def main():
    c = await asyncpg.connect(DB)
    latest = await c.fetchval("SELECT MAX(trade_date) FROM ohlcv_daily")
    print(f"Latest date: {latest}")

    # Test all-stocks query
    rows = await c.fetch("""
        SELECT * FROM (
            SELECT
                ohlcv_base.symbol,
                COALESCE(i.company_name, ohlcv_base.symbol) AS name,
                ohlcv_base.close,
                ohlcv_base.prev_close,
                (ohlcv_base.close - ohlcv_base.prev_close) AS change,
                ROUND(CASE WHEN ohlcv_base.prev_close > 0
                    THEN ((ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100)
                    ELSE 0 END::numeric, 2) AS change_pct,
                ohlcv_base.volume
            FROM (
                SELECT id, symbol, trade_date, open, high, low, close, volume,
                    COALESCE(prev_close, LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date)) AS prev_close
                FROM ohlcv_daily
            ) ohlcv_base
            LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
            WHERE ohlcv_base.trade_date = $1
              AND ohlcv_base.close > 0
        ) ranked
        ORDER BY change_pct DESC NULLS LAST
        LIMIT 5
    """, latest)

    print(f"\nTop 5 by change_pct (all-stocks query):")
    for r in rows:
        print(f"  {r['symbol']:15s} ₹{float(r['close']):8.2f}  {float(r['change_pct']):+.2f}%  {r['name'][:40]}")

    # Test search
    search_rows = await c.fetch("""
        SELECT DISTINCT ON (ohlcv_base.symbol)
            ohlcv_base.symbol,
            COALESCE(i.company_name, ohlcv_base.symbol) AS name,
            ohlcv_base.close,
            ROUND(CASE WHEN ohlcv_base.prev_close > 0
                THEN ((ohlcv_base.close - ohlcv_base.prev_close) / ohlcv_base.prev_close * 100)
                ELSE 0 END::numeric, 2) AS change_pct
        FROM (
            SELECT id, symbol, trade_date, open, high, low, close, volume,
                COALESCE(prev_close, LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date)) AS prev_close
            FROM ohlcv_daily
        ) ohlcv_base
        LEFT JOIN instruments i ON i.symbol = ohlcv_base.symbol AND i.exchange = 'NSE'
        WHERE ohlcv_base.trade_date = $1
          AND (UPPER(ohlcv_base.symbol) LIKE $2
               OR UPPER(COALESCE(i.company_name, '')) LIKE $2)
        ORDER BY ohlcv_base.symbol, ohlcv_base.trade_date DESC
        LIMIT 8
    """, latest, "%TATA%")

    print(f"\nSearch 'TATA' results:")
    for r in search_rows:
        print(f"  {r['symbol']:15s} ₹{float(r['close']):8.2f}  {float(r['change_pct']):+.2f}%  {r['name'][:40]}")

    # Test breadth
    breadth = await c.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE close > prev_close) AS advances,
            COUNT(*) FILTER (WHERE close < prev_close) AS declines,
            COUNT(*) AS total
        FROM (
            SELECT close, COALESCE(prev_close, LAG(close) OVER (PARTITION BY symbol ORDER BY trade_date)) AS prev_close
            FROM ohlcv_daily WHERE trade_date = $1
        ) b
        WHERE prev_close IS NOT NULL AND prev_close > 0
    """, latest)
    print(f"\nMarket breadth: {dict(breadth)}")
    await c.close()

asyncio.run(main())
