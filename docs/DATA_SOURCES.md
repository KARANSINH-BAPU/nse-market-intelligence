# KP — Data Sources Documentation

Version: 0.1.0  
Last Updated: 2026-09-07

---

## Data Provider Strategy

KP uses a provider abstraction layer, allowing data sources to be swapped without changing business logic.

```
DATA_PROVIDER = yfinance | zerodha | angel | fyers | truedata | mock
```

---

## Provider Matrix

| Provider | Historical EOD | Intraday (delayed) | Live Tick | NSE Coverage | Cost | Credentials |
|---|---|---|---|---|---|---|
| **yfinance** | ✅ ~20 years | ❌ | ❌ | Full NSE (via Yahoo) | Free | None |
| **nsepython** | ✅ Limited | ✅ Delayed | ❌ | NSE official | Free | None |
| **Zerodha Kite** | ✅ 60+ days OHLC | ✅ 1-min delayed | ✅ Tick | Full NSE | ~₹2000/mo | API key + secret |
| **Angel One SmartAPI** | ✅ Limited | ✅ 1-min | ✅ Tick | Full NSE | Free tier | API key + TOTP |
| **Fyers API** | ✅ Historical | ✅ 1-min | ✅ Tick | NSE + BSE | Free tier | App ID + secret |
| **Truedata** | ✅ Deep history | ✅ 1-min | ✅ Tick | Full NSE + BSE | Paid | Subscription |

---

## Phase-by-Phase Data Usage

### Phase 1-2 (Current)
**Source:** None (no market data fetched yet)  
**Purpose:** Infrastructure, APIs, frontend shell

### Phase 3 (Instrument Master)
**Source:** yfinance + nsepython  
**Purpose:** Build and maintain NSE instrument universe  
**Credentials required:** None

### Phase 4 (Historical Data)
**Source:** yfinance (primary), nsepython (supplement)  
**Purpose:** 10-year OHLCV historical data for NSE stocks  
**Credentials required:** None  
**Notes:** yfinance provides EOD data. Intraday history limited to 60 days.

### Phase 5 (Live Feed)
**Source:** Zerodha Kite Connect (recommended) or Angel One SmartAPI  
**Purpose:** Real-time tick data during NSE market hours  
**Credentials required:** YES — API key from broker  

### Phase 27 (News)
**Source:** NewsAPI / GNews / custom  
**Purpose:** News headlines mapped to NSE instruments  
**Credentials required:** YES — NewsAPI key

---

## Provider Abstraction Interface

```python
class MarketDataProvider(ABC):
    
    @abstractmethod
    async def get_quote(self, symbol: str) -> Quote:
        """Get current quote for a symbol."""
    
    @abstractmethod
    async def get_ohlcv(self, symbol: str, interval: str, start: date, end: date) -> pd.DataFrame:
        """Get OHLCV historical data."""
    
    @abstractmethod
    async def subscribe_ticks(self, symbols: list[str], callback: Callable) -> None:
        """Subscribe to real-time tick stream."""
    
    @abstractmethod
    async def get_instrument_list(self) -> list[Instrument]:
        """Get complete instrument universe."""
```

---

## Data Quality Requirements

Every data event must pass validation before storage:

| Check | Description |
|---|---|
| Timestamp | Valid, not future, within session window |
| Symbol | Exists in instrument master |
| Price | Positive, within circuit limits |
| Volume | Non-negative |
| OHLC consistency | High >= max(Open,Close), Low <= min(Open,Close) |
| Sequence | No out-of-order events (where sequence available) |
| Duplicate | No duplicate event_id or timestamp for same symbol |
| Stale | Event timestamp within expected feed latency window |

---

## Data Availability by Type

| Data Type | Provider | Frequency | History | Status |
|---|---|---|---|---|
| OHLCV EOD | yfinance | Daily | ~20 years | Phase 4 |
| OHLCV Intraday 1m | Zerodha/Angel | 1-minute | 60 days | Phase 5 |
| Tick data | Zerodha/Angel | Real-time | Session only | Phase 5 |
| Market depth | Zerodha/Angel | Real-time | None | Phase 5 |
| Futures OI | Zerodha/Angel | Real-time | Limited | Phase 5 |
| Options chain | Zerodha/NSE | Real-time | Limited | Phase 28 |
| Fundamentals | YF / screener.in | Quarterly | Available | Phase 46 |
| Corporate actions | nsepython / BSE | Event | Available | Phase 40 |
| News | NewsAPI / GNews | Real-time | 30 days | Phase 27 |

---

## Data Licensing

> **IMPORTANT: Always check data provider terms before use.**

| Provider | License Type | Commercial Use | Redistribution |
|---|---|---|---|
| yfinance | Yahoo Finance ToS | Personal/research | Restricted |
| nsepython | NSE public data | Check NSE ToS | Restricted |
| Zerodha Kite | Subscription | Yes (with subscription) | No |
| Angel One | Platform terms | With account | No |
| NewsAPI | API terms | Paid tier required | No |

**Rule:** KP must never redistribute raw vendor data. Derived features and signals (owned by KP) are different from raw market data.

---

## Missing Data Policy

When data is unavailable for a symbol:
1. Mark the instrument state as `UNAVAILABLE`
2. Show `UNAVAIL` indicator in UI — never show stale data as fresh
3. Log data gap event to `data_incidents` table
4. Do NOT fabricate values
5. Do NOT use the last known price without clearly marking it STALE with a timestamp

## Feed Outage Policy

If the live feed disconnects:
1. Mark all affected symbols as `STALE` immediately in Redis
2. Attempt reconnection with exponential backoff
3. Log gap start time
4. On reconnect, identify data gap
5. Attempt to recover gap data from provider if available
6. Validate recovered data before storing
7. Mark gap recovered or irrecoverable in `data_incidents`
