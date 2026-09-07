# KP — NSE Market Intelligence Platform

[![CI](https://github.com/your-org/kp/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/kp/actions)

**KP** is a production-grade, real-time AI-powered NSE market intelligence platform.

It combines real-time NSE market data, technical analysis, machine learning predictions, explainable AI, sector intelligence, F&O analytics, and professional portfolio tools — all in a single platform.

> **Current Phase:** Phase 1 — Foundation (infrastructure, APIs, UI shell, KP CLI)
> **Data:** Not yet live (configured in Phase 5)
> **ML:** Not yet active (Phase 10+)

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | >= 3.12 | 3.14.x tested |
| Node.js | >= 20 | 24.x tested |
| PostgreSQL | 17 | + TimescaleDB extension |
| Redis | 7 | |
| Git | any recent | |

### Clone & Configure

```bash
git clone <repo-url> KP
cd KP

# Copy and edit the environment file
copy .env.development.example .env
# Edit .env with your settings and API credentials
notepad .env
```

### Setup

```bash
# Install Python dependencies
cd backend
python -m uv sync
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Run environment checks
python scripts/kp.py doctor

# Run database migrations (PostgreSQL must be running)
python -m alembic -c alembic.ini upgrade head
```

### Start

```bash
python scripts/kp.py start
```

- Backend API: http://localhost:8000
- API Docs:    http://localhost:8000/docs
- Frontend:    http://localhost:3000
- Health:      http://localhost:8000/health

### KP CLI

```bash
python scripts/kp.py doctor    # Check environment
python scripts/kp.py setup     # Automated setup
python scripts/kp.py start     # Start all services
python scripts/kp.py stop      # Stop all services
python scripts/kp.py backup    # Backup database
python scripts/kp.py version   # Show version
```

---

## Architecture

```
KP/
├── frontend/       Next.js 15 + TypeScript (premium dark UI)
├── backend/        FastAPI + Python 3.14 + asyncio
├── ml/             ML pipeline (Phase 10+)
├── data/           Data providers + ingestion (Phase 3+)
├── migrations/     Alembic database migrations
├── scripts/        KP CLI (doctor, setup, start, stop)
├── tests/          pytest unit + integration tests
├── docs/           Complete documentation
├── docker/         Dockerfiles
└── docker-compose.yml  PostgreSQL + Redis services
```

**Backend:** FastAPI · SQLAlchemy 2.0 · Asyncpg · Redis · Pydantic v2 · Structlog  
**Frontend:** Next.js 15 · TypeScript · Vanilla CSS (no Tailwind)  
**Database:** PostgreSQL 17 + TimescaleDB · Alembic migrations  
**Cache:** Redis 7  
**ML (Phase 10+):** scikit-learn · XGBoost · LightGBM · PyTorch · SHAP

---

## Data Sources

| Provider | Type | Phase | Credentials |
|---|---|---|---|
| yfinance | Historical EOD | Phase 1+ | None |
| nsepython | NSE data | Phase 3+ | None |
| Zerodha Kite | Live streaming | Phase 5+ | API key required |
| Angel One | Live streaming | Phase 5+ | API key required |

---

## Principles

KP is built on strict data integrity principles. See [AI_RULES.md](AI_RULES.md).

- Never fabricates data, predictions, or metrics
- Never hard-codes BUY/SELL signals
- Never claims guaranteed profit or impossible accuracy  
- All predictions tracked with Prediction DNA IDs
- All model performance measured from real out-of-sample results
- WAIT is a valid and important signal

---

## Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Environment inspection | ✅ Complete |
| 1 | Foundation: infra, API, frontend, CLI | ✅ Active |
| 2 | Database schema completion | Planned |
| 3 | Instrument master + NSE universe | Planned |
| 4 | Historical data pipeline | Planned |
| 5 | Real-time live feed | Planned |
| 6+ | Feature engine, ML, predictions... | Future |

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database Design](docs/DATABASE.md)
- [Data Sources](docs/DATA_SOURCES.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Cross-Computer Setup](docs/CROSS_COMPUTER_SETUP.md)
- [AI Rules](AI_RULES.md)
- [Changelog](CHANGELOG.md)

---

## License

Proprietary. All rights reserved. See [docs/LICENSING.md](docs/LICENSING.md).
