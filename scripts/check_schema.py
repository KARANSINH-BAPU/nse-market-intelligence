import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://kp_user:kp_dev_password@localhost:5432/kp_db")
    cols = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'instruments' ORDER BY ordinal_position"
    )
    print("instruments columns:", [r["column_name"] for r in cols])
    row = await conn.fetchrow("SELECT * FROM instruments LIMIT 1")
    if row:
        print("sample row:", dict(row))
    # Check sectors table if exists
    sec_exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sectors')")
    print("sectors table exists:", sec_exists)
    if sec_exists:
        sec_cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'sectors'")
        print("sectors cols:", [r["column_name"] for r in sec_cols])
        sec_sample = await conn.fetch("SELECT * FROM sectors LIMIT 5")
        for r in sec_sample:
            print("  sector:", dict(r))
    await conn.close()

asyncio.run(main())
