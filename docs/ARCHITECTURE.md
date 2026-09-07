# KP — Architecture Documentation

Version: 0.1.0  
Last Updated: 2026-09-07

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         KP PLATFORM                             │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  NSE / Data │    │   KP BACKEND     │    │  KP FRONTEND  │  │
│  │  Providers  │───▶│   (FastAPI)      │───▶│  (Next.js)    │  │
│  └─────────────┘    │                  │    └───────────────┘  │
│                     │  ┌────────────┐  │                       │
│  ┌─────────────┐    │  │ Data Qual  │  │    WebSocket          │
│  │   Redis     │◀──▶│  │ Engine     │  │◀────────────────────  │
│  │  (Hot State)│    │  └────────────┘  │                       │
│  └─────────────┘    │  ┌────────────┐  │                       │
│                     │  │ Feature    │  │                       │
│  ┌─────────────┐    │  │ Engine     │  │                       │
│  │ PostgreSQL  │◀──▶│  └────────────┘  │                       │
│  │ +TimescaleDB│    │  ┌────────────┐  │                       │
│  │ (Persistent)│    │  │ ML Engine  │  │                       │
│  └─────────────┘    │  └────────────┘  │                       │
│                     └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
MARKET EVENT
    ↓
DATA PROVIDER (yfinance / Zerodha / Angel)
    ↓
INGESTION WORKER
    ↓
TIMESTAMP (receive_at recorded)
    ↓
DATA QUALITY CHECKS
    ↓ (if valid)
NORMALIZATION → KP Canonical Schema
    ↓
RAW STORE (PostgreSQL raw_market_events)
    ↓
FEATURE ENGINE (technical indicators, microstructure, etc.)
    ↓
AI ENGINE (XGBoost / LSTM / Ensemble)
    ↓
SIGNAL + RISK EVALUATION
    ↓
REDIS PUBLISH (hot state update)
    ↓
WEBSOCKET BROADCAST
    ↓
KP FRONTEND (real-time display)
    ↓ (parallel)
PERSISTENT STORE (PostgreSQL timeseries tables)
```

## Technology Stack

### Backend
- **Python 3.14** — application language
- **FastAPI** — async HTTP + WebSocket framework
- **uvicorn** — ASGI server
- **SQLAlchemy 2.0** — async ORM
- **asyncpg** — async PostgreSQL driver
- **Alembic** — database migrations
- **Pydantic v2** — data validation
- **redis-py** — async Redis client
- **structlog** — structured JSON logging
- **python-jose** — JWT tokens
- **passlib** — bcrypt password hashing

### Frontend
- **Next.js 15** — React framework with App Router
- **TypeScript** — type safety
- **Vanilla CSS** — custom design system (no Tailwind)
- **lucide-react** — icons
- **zustand** — lightweight state management
- **swr** — data fetching and caching
- Google Fonts: Inter (UI), JetBrains Mono (numbers/code)

### Database
- **PostgreSQL 17** — primary relational database
- **TimescaleDB** — time-series extension for market data
- Hypertables for: ticks, OHLCV, features, latency metrics, system health

### Cache
- **Redis 7** — hot state, pub/sub, session cache
- Keys: `kp:price:{symbol}`, `kp:signal:{symbol}`, `kp:breadth`, etc.

### ML (Phase 10+)
- scikit-learn — baseline models, preprocessing
- XGBoost — primary gradient boosting model
- LightGBM — alternative gradient boosting
- PyTorch — LSTM, GRU, Transformer
- SHAP — explainability

### Infrastructure
- Docker Compose — local services (PostgreSQL + Redis)
- GitHub Actions — CI/CD
- uv — Python package manager

## API Architecture

### REST API (FastAPI)
Base URL: `http://localhost:8000/api/v1/`

Endpoint groups (Phase 1 implemented in bold, others scaffolded):

| Group | Prefix | Status |
|---|---|---|
| **Health** | `/health` | Phase 1 |
| **System** | `/api/v1/system` | Phase 1 |
| Auth | `/api/v1/auth` | Phase 2 |
| Instruments | `/api/v1/instruments` | Phase 3 |
| Market | `/api/v1/market` | Phase 5 |
| Stocks | `/api/v1/stocks` | Phase 5 |
| Historical | `/api/v1/history` | Phase 4 |
| Technical | `/api/v1/technical` | Phase 8 |
| Fundamentals | `/api/v1/fundamentals` | Phase 11 |
| News | `/api/v1/news` | Phase 27 |
| F&O | `/api/v1/fno` | Phase 28 |
| Predictions | `/api/v1/predictions` | Phase 13 |
| Signals | `/api/v1/signals` | Phase 13 |
| Screener | `/api/v1/screener` | Phase 14 |
| Portfolio | `/api/v1/portfolio` | Phase 26 |
| Paper Trading | `/api/v1/paper` | Phase 25 |
| Backtest | `/api/v1/backtest` | Phase 22 |
| Models | `/api/v1/models` | Phase 30 |
| Alerts | `/api/v1/alerts` | Phase 32 |
| AI Assistant | `/api/v1/assistant` | Phase 29 |
| Admin | `/api/v1/admin` | Phase 32 |

### WebSocket Architecture
Endpoint: `ws://localhost:8000/ws`

Channel subscriptions (JSON message protocol):
```json
{ "type": "subscribe", "channels": ["market", "stock:RELIANCE", "signals"] }
{ "type": "unsubscribe", "channels": ["market"] }
{ "type": "ping" }
```

Channels:
- `market` — NIFTY, BANKNIFTY, breadth, regime
- `stock:{SYMBOL}` — per-symbol updates
- `watchlist` — user watchlist changes
- `signals` — AI signal updates
- `predictions` — new predictions
- `alerts` — user alert triggers
- `portfolio` — portfolio updates
- `system` — system status changes

## Latency Architecture

Every market event tracks:
```
provider_timestamp → receive_timestamp → validated_timestamp
→ feature_timestamp → inference_timestamp → signal_timestamp
→ publish_timestamp → frontend_receipt_timestamp
```

Latency metrics stored in PostgreSQL `latency_metrics` hypertable.
All metrics calculated from real measured timestamps.
Target: minimize application-side latency. Actual values measured and reported.

## Security Architecture

- JWT authentication (RS256 in production)
- bcrypt password hashing
- Role-based access control: USER / RESEARCHER / ADMIN
- Rate limiting (planned Phase 32)
- Input validation via Pydantic
- Secure CORS configuration
- HTTP security headers (planned)
- Audit logging for all sensitive actions
- No secrets in source code or git history

## Deployment Architecture

### Development (Windows — current)
- PostgreSQL 17: native service
- Redis: Memurai or native Windows port
- Backend: uvicorn --reload
- Frontend: npm run dev

### Production (Recommended)
- Docker Compose (docker-compose.prod.yml)
- Reverse proxy: nginx or Caddy
- PostgreSQL + TimescaleDB: Docker
- Redis: Docker
- Backend: uvicorn with multiple workers
- Frontend: Next.js standalone build

### Cross-Computer Portability
See [CROSS_COMPUTER_SETUP.md](CROSS_COMPUTER_SETUP.md).
Clone → configure .env → python scripts/kp.py setup → python scripts/kp.py start → works.
