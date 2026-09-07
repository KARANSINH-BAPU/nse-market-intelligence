# KP — Cross-Computer Setup Guide

Version: 0.1.0  
Last Updated: 2026-09-07

---

## Goal

Any compatible computer should be able to run KP after:
1. Cloning or copying the project
2. Configuring `.env` with legitimate credentials
3. Running `python scripts/kp.py setup`
4. Running `python scripts/kp.py start`

No manual database creation, no hidden configuration, no developer-specific files.

---

## Prerequisites (Any Computer)

| Requirement | Minimum | Tested |
|---|---|---|
| OS | Windows 10/11, macOS 12+, Ubuntu 22+ | Windows 11 |
| Python | 3.12+ | 3.14.7 |
| Node.js | 20+ | 24.20.0 |
| npm | 10+ | 11.19.0 |
| PostgreSQL | 17+ | 17.11 |
| TimescaleDB | 2.x | latest |
| Redis | 7+ | 7.x |
| Git | any recent | 2.55.0 |
| RAM | 8 GB | 7.7 GB |
| Disk | 10 GB free | 206 GB free |
| uv | 0.10+ | 0.12.10 |

**GPU:** Not required for Phase 1–9. Optional for deep learning (Phase 11+).

---

## Method 1: Git Clone (Recommended)

```bash
# Clone the repository
git clone <repo-url> KP
cd KP

# Configure environment
copy .env.development.example .env
# Edit .env — set your PostgreSQL password and any API keys

# Run automated setup
python scripts/kp.py setup

# Run health checks
python scripts/kp.py doctor

# Run database migrations
python -m alembic -c alembic.ini upgrade head

# Start everything
python scripts/kp.py start
```

---

## Method 2: ZIP Transfer

```bash
# On Computer A: create portable bundle
# (use git archive or zip, excluding .env and node_modules)

# On Computer B:
# 1. Extract ZIP
# 2. cd KP
# 3. copy .env.development.example .env
# 4. Edit .env
# 5. python scripts/kp.py setup
# 6. python scripts/kp.py doctor
# 7. python -m alembic -c alembic.ini upgrade head
# 8. python scripts/kp.py start
```

---

## Installing PostgreSQL + TimescaleDB

### Windows
```powershell
# Install PostgreSQL via winget
winget install PostgreSQL.PostgreSQL.17

# After install, add TimescaleDB:
# Download from https://docs.timescale.com/install/latest/self-hosted/installation-windows/
# Run the installer
# Then in psql or pgAdmin:
CREATE EXTENSION IF NOT EXISTS timescaledb;

# Create KP database and user:
psql -U postgres
CREATE USER kp_user WITH PASSWORD 'your_password';
CREATE DATABASE kp_db OWNER kp_user;
GRANT ALL PRIVILEGES ON DATABASE kp_db TO kp_user;
\q
```

### Ubuntu/Debian
```bash
sudo apt-get install -y postgresql-17 postgresql-client-17
# Install TimescaleDB for PostgreSQL 17
sudo apt-get install -y timescaledb-2-postgresql-17
sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql

# Create user and DB
sudo -u postgres psql -c "CREATE USER kp_user WITH PASSWORD 'your_password';"
sudo -u postgres psql -c "CREATE DATABASE kp_db OWNER kp_user;"
```

### Docker (no local install needed)
```bash
docker-compose up -d postgres redis
```

---

## Installing Redis

### Windows
```powershell
# Option 1: Memurai (Redis-compatible for Windows)
# Download from https://www.memurai.com/get-memurai
# Install and it runs as a Windows service

# Option 2: via winget (if available)
winget install Memurai.Memurai
```

### Ubuntu
```bash
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Docker
```bash
docker-compose up -d redis
```

---

## Environment Configuration

Copy `.env.development.example` to `.env` and configure:

### Minimum Required Settings
```ini
DATABASE_URL=postgresql+asyncpg://kp_user:YOUR_PASSWORD@localhost:5432/kp_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_hex(32))">
JWT_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
```

### For Live Data (Phase 5+)
```ini
DATA_PROVIDER=zerodha
ZERODHA_API_KEY=your_key
ZERODHA_API_SECRET=your_secret
ZERODHA_ACCESS_TOKEN=your_daily_token
```

---

## Running Migrations on a New Machine

```bash
# Ensure PostgreSQL is running and .env is configured
python scripts/kp.py doctor

# Run all pending migrations
python -m alembic -c alembic.ini upgrade head

# Verify
python -m alembic -c alembic.ini current
```

---

## Database Transfer Between Computers

### Backup (Computer A)
```bash
python scripts/kp.py backup
# Creates: backups/kp_backup_YYYYMMDD_HHMMSS.sql
```

### Restore (Computer B)
```bash
# After setup + migrations:
psql -U kp_user -d kp_db < backups/kp_backup_YYYYMMDD_HHMMSS.sql
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `kp doctor` shows DB fail | PostgreSQL running? Password correct in .env? |
| `kp doctor` shows Redis fail | Redis/Memurai service running? |
| `uv` not found | Run as `python -m uv` instead |
| npm blocked on Windows | Run: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Port 8000 in use | Run `python scripts/kp.py stop` or kill the process |
| TimescaleDB extension missing | See PostgreSQL install guide above |

---

## Portability Guarantee

KP does NOT depend on:
- Any specific Windows username or path (`C:\Users\SpecificName\...`)
- Machine-specific absolute paths in source code
- Hidden developer-specific configuration
- Files stored outside the project directory without documentation
- Any specific IDE or editor
- Developer-specific database state (all structure is in migrations)

KP DOES require:
- A configured `.env` file (never committed to git)
- PostgreSQL 17 + TimescaleDB accessible at the configured DATABASE_URL
- Redis 7 accessible at the configured REDIS_URL
- For live data: valid API credentials from the configured DATA_PROVIDER
