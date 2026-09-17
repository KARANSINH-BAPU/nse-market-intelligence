/**
 * KP Frontend — API Client
 * Typed fetch wrappers for the KP backend at localhost:8000.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Generic fetcher ────────────────────────────────────────
async function kpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KP API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────
export interface MarketStatus {
  is_open: boolean;
  phase: string;
  exchange: string;
  timezone: string;
  server_time_ist: string;
  server_time_utc: string;
}

export interface IndexQuote {
  symbol: string;
  ltp: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  quality: "live" | "unavailable";
  fetched_at: string;
  source: string;
  error?: string;
}

export interface MarketSnapshot {
  status: string;
  phase: string;
  is_open: boolean;
  indices: Record<string, IndexQuote>;
  source: string;
  fetched_at: string;
}

export interface InstrumentSummary {
  id: string;
  symbol: string;
  company_name: string | null;
  exchange: string;
  instrument_type: string;
  active: boolean;
  market_cap_category: string | null;
  fno_eligible: boolean;
  isin: string | null;
}

export interface InstrumentList {
  total: number;
  page: number;
  page_size: number;
  items: InstrumentSummary[];
}

export interface OHLCVBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OHLCVResponse {
  symbol: string;
  period: string;
  interval: string;
  count: number;
  bars: OHLCVBar[];
  source: string;
  fetched_at: string;
}

export interface SystemInfo {
  app: string;
  version: string;
  environment: string;
  database: string;
  redis: string;
  uptime_seconds: number;
}

// ── API Functions ──────────────────────────────────────────
export const api = {
  /** NSE market open/close status */
  marketStatus: () => kpFetch<MarketStatus>("/api/v1/market/status"),

  /** NIFTY50 + BANKNIFTY live snapshot via yfinance */
  marketSnapshot: () => kpFetch<MarketSnapshot>("/api/v1/market/snapshot"),

  /** Single equity quote */
  quote: (symbol: string) =>
    kpFetch<IndexQuote>(`/api/v1/market/quote/${symbol}`),

  /** OHLCV bars */
  ohlcv: (symbol: string, period = "1d", interval = "5m") =>
    kpFetch<OHLCVResponse>(
      `/api/v1/market/ohlcv/${symbol}?period=${period}&interval=${interval}`
    ),

  /** List / search instruments */
  instruments: (params?: {
    q?: string;
    page?: number;
    page_size?: number;
    instrument_type?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q)               qs.set("q", params.q);
    if (params?.page)            qs.set("page", String(params.page));
    if (params?.page_size)       qs.set("page_size", String(params.page_size));
    if (params?.instrument_type) qs.set("instrument_type", params.instrument_type);
    return kpFetch<InstrumentList>(`/api/v1/instruments?${qs}`);
  },

  /** System health info */
  systemInfo: () => kpFetch<SystemInfo>("/api/v1/system/info"),

  /** Health check */
  health: () => kpFetch<{ status: string }>("/health"),
};
