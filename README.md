# KP — NSE Market Intelligence Platform

> **AI-powered, real-time NSE stock market analytics platform for Indian equity markets.**

[![Live Demo](https://img.shields.io/badge/Live-Demo-6366f1?style=for-the-badge)](https://nse-market-intelligence.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-KARANSINH--BAPU-24292e?style=for-the-badge&logo=github)](https://github.com/KARANSINH-BAPU/nse-market-intelligence)

---

## 🚀Features

| Feature | Description |
|---------|-------------|
| 📊 **Live Dashboard** | Real-time Nifty50, Sensex, BankNifty indices with live WebSocket ticks |
| 📈 **2060+ NSE Stocks** | Full NSE instrument list with live intraday prices from yfinance |
| 🤖 **AI Predictions** | Composite RSI + MACD + SMA scoring → BUY/SELL/HOLD per stock |
| 🔍 **Smart Screener** | Filter stocks by RSI, MACD, SMA, volume, sector |
| 🧠 **AI Advisor** | Natural language chat for stock analysis & recommendations |
| 📉 **Technical Charts** | Interactive candlestick + RSI/MACD/SMA overlays (1M–1Y) |
| 🗂️ **Sectors** | 12 NSE sectors with live performance aggregation |
| 📰 **Live News** | Real-time NSE market news via RSS feeds |
| 🔬 **Backtesting** | Strategy backtesting on historical OHLCV data |
| 🎯 **F&O Data** | Futures & Options market data |
| 🔎 **AI Radar** | Momentum & breakout scanner |
| 📡 **WebSocket** | Real-time price ticks via `ws://` connection |

---

## 🏗️ Architecture

```
KP Platform
├── frontend/          ← Next.js 16 (React 19, TypeScript)
│   ├── app/           ← App Router pages (dashboard, markets, predictions…)
│   ├── components/    ← Sidebar, Header, Charts, SystemStatus
│   └── lib/           ← API client, WebSocket hooks
│
└── backend/           ← FastAPI (Python 3.12)
    ├── app/api/v1/    ← REST endpoints (market, signals, ohlcv, instruments…)
    ├── app/services/  ← live_quotes, market_data, quote_cache
    ├── app/websockets/← WebSocket broadcaster (real-time ticks)
    └── app/models/    ← SQLAlchemy ORM models
```

**Database:** PostgreSQL 18 · **Data:** yfinance (Yahoo Finance) · **Cache:** In-memory quote cache

---

## ⚡ Quick Start (Local)

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 14+

### 1. Clone
```bash
git clone https://github.com/KARANSINH-BAPU/nse-market-intelligence.git
cd nse-market-intelligence
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Configure DB
createdb kp_db
createuser kp_user
# Set password: kp_dev_password

# Run migrations
alembic upgrade head

# Ingest historical data (2060 NSE stocks)
python scripts/ingest_instruments.py
python scripts/ingest_ohlcv.py

# Start backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
cd frontend

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000" >> .env.local

npm install
npm run dev     # → http://localhost:3000
```

---

## 🌐 Live Deployment

### Frontend → Vercel
1. Connect repo at [vercel.com](https://vercel.com)
2. Set **Root Directory** = `frontend`
3. Add env variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   NEXT_PUBLIC_WS_URL=wss://your-backend.railway.app
   ```

### Backend → Railway
1. Connect repo at [railway.app](https://railway.app)
2. Set **Root Directory** = `backend`
3. Add env variables:
   ```
   DATABASE_URL=postgresql://...
   SECRET_KEY=your-secret-key
   ```
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/market/all-stocks` | All 2060 NSE stocks with live prices |
| `GET /api/v1/market/movers` | Top gainers & losers |
| `GET /api/v1/market/snapshot` | Index quotes (Nifty, Sensex, BankNifty) |
| `GET /api/v1/market/search?q=RELIANCE` | Global stock search |
| `GET /api/v1/signals?limit=5000` | AI composite signals for all stocks |
| `GET /api/v1/ohlcv/{symbol}?period=1y` | Historical OHLCV + indicators |
| `GET /api/v1/news` | Live market news |
| `WS  /ws` | Real-time price WebSocket |
| `GET /docs` | Swagger API docs |

---

## 📊 Data Sources

- **Live Prices:** [yfinance](https://github.com/ranaroussi/yfinance) (Yahoo Finance NSE data)
- **Instruments:** NSE official instrument list (2060+ stocks)
- **Historical OHLCV:** Stored in PostgreSQL, updated daily
- **News:** NSE/Economic Times RSS feeds

> ⚠️ Data is sourced from Yahoo Finance via yfinance. Not affiliated with NSE India.
> This platform is for **educational purposes only** — NOT financial advice.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Vanilla CSS (dark theme, glassmorphism) |
| Charts | Recharts |
| Backend | FastAPI, Python 3.12, asyncpg |
| Database | PostgreSQL 18 |
| Data | yfinance (Yahoo Finance) |
| Real-time | WebSockets (FastAPI native) |
| Auth | JWT (python-jose) |

---

## 👨‍💻 Author

**Karansinh Bapu**
- GitHub: [@KARANSINH-BAPU](https://github.com/KARANSINH-BAPU)

---

*Built for educational & demonstration purposes. All market data sourced from publicly available APIs.*
