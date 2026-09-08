"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  TrendingUp, TrendingDown, ArrowLeft, RefreshCw,
  BarChart2, Activity, ExternalLink, Clock,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Lazy-load recharts chart
const TechnicalChart = dynamic(
  () => import("@/components/charts/TechnicalChart"),
  { ssr: false, loading: () => <div style={{ height: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>Loading chart…</div> }
);

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtVol(n: number | null | undefined) {
  if (!n) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

interface Bar {
  trade_date: string; open: number; high: number; low: number;
  close: number; volume: number; change_pct: number;
  rsi: number | null; macd: number | null; macd_signal: number | null;
  macd_hist: number | null; sma20: number | null; ema12: number | null;
}
interface OhlcvData {
  symbol: string; period: string; count: number; bars: Bar[];
  close: number; change_pct: number; rsi: number|null; macd: number|null; sma20: number|null;
}

const PERIODS = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
];

export default function InstrumentDetailPage() {
  const { symbol } = useParams() as { symbol: string };
  const SYM = symbol?.toUpperCase();

  const [data,    setData]    = useState<OhlcvData | null>(null);
  const [quote,   setQuote]   = useState<any>(null);
  const [period,  setPeriod]  = useState("1y");
  const [loading, setLoading] = useState(false);
  const [lastAt,  setLastAt]  = useState<Date | null>(null);
  const [tab,     setTab]     = useState<"chart"|"table">("chart");

  const refresh = useCallback(async () => {
    if (!SYM) return;
    setLoading(true);
    try {
      // Fetch OHLCV history from our DB
      const [ohlcvRes, quoteRes] = await Promise.allSettled([
        fetch(`${API}/api/v1/ohlcv/${SYM}?period=${period}`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/v1/market/search?q=${SYM}&limit=1`).then(r => r.ok ? r.json() : null),
      ]);
      if (ohlcvRes.status === "fulfilled" && ohlcvRes.value) setData(ohlcvRes.value);
      if (quoteRes.status === "fulfilled" && quoteRes.value?.results?.length) {
        setQuote(quoteRes.value.results[0]);
      }
      setLastAt(new Date());
    } finally { setLoading(false); }
  }, [SYM, period]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh price every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      if (!SYM) return;
      try {
        const r = await fetch(`${API}/api/v1/market/search?q=${SYM}&limit=1`);
        if (r.ok) {
          const d = await r.json();
          if (d.results?.length) setQuote(d.results[0]);
        }
      } catch {}
    }, 30000);
    return () => clearInterval(id);
  }, [SYM]);

  const latest = data?.bars[data.bars.length - 1];
  const ltp    = quote?.close ?? latest?.close;
  const change = quote?.change_pct ?? latest?.change_pct;
  const up     = (change ?? 0) >= 0;

  // For TechnicalChart — MUST match FeatureRow interface exactly:
  // date, close, open, high, low, volume, rsi_14, macd_line, macd_signal, macd_hist, sma_20, ema_12
  const chartFeatures = (data?.bars ?? []).map(b => ({
    date:        b.trade_date,
    close:       b.close,
    open:        b.open,
    high:        b.high,
    low:         b.low,
    volume:      b.volume,
    rsi_14:      b.rsi,
    macd_line:   b.macd,
    macd_signal: b.macd_signal,
    macd_hist:   b.macd_hist,
    sma_20:      b.sma20,
    ema_12:      b.ema12,
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
        fontSize: "0.857rem", color: "var(--text-secondary)" }}>
        <Link href="/instruments" style={{ color: "var(--text-secondary)",
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13} /> Instruments
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{SYM}</span>
      </div>

      {/* Quote hero */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800,
                fontFamily: "var(--font-mono)", margin: 0 }}>{SYM}</h1>
              <span className="data-source live">NSE · EQ</span>
              <span className="data-source">yfinance</span>
              {quote?.name && (
                <span style={{ fontSize: "0.857rem", color: "var(--text-tertiary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                  {quote.name}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: "2.2rem", fontWeight: 700,
                fontFamily: "var(--font-mono)", lineHeight: 1,
                color: up ? "var(--color-up)" : "var(--color-down)" }}>
                {ltp ? `₹${fmt(ltp)}` : "—"}
              </span>
              {change != null && (
                <span style={{ fontSize: "1rem", fontFamily: "var(--font-mono)",
                  color: up ? "var(--color-up)" : "var(--color-down)" }}>
                  {up ? <TrendingUp size={14} style={{ display: "inline", marginRight: 4 }} />
                       : <TrendingDown size={14} style={{ display: "inline", marginRight: 4 }} />}
                  {fmtPct(change)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button onClick={refresh} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-03)",
                border: "1px solid var(--border)", color: "var(--text-secondary)",
                borderRadius: "var(--border-radius)", padding: "6px 12px",
                cursor: "pointer", fontSize: "0.786rem" }}>
              <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              {lastAt ? lastAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Refresh"}
            </button>
            {lastAt && <span style={{ fontSize: "0.643rem", color: "var(--text-tertiary)" }}>Auto-refresh · real-time data</span>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))",
          gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          {[
            { label: "Prev Close", value: latest ? `₹${fmt(latest.open)}` : "—" },
            { label: "Open",       value: latest ? `₹${fmt(latest.open)}` : "—" },
            { label: "Day High",   value: latest ? `₹${fmt(latest.high)}` : "—" },
            { label: "Day Low",    value: latest ? `₹${fmt(latest.low)}` : "—" },
            { label: "Volume",     value: latest ? fmtVol(latest.volume) : "—" },
            { label: "RSI(14)",    value: latest?.rsi != null ? latest.rsi.toFixed(1) : "—" },
            { label: "MACD",       value: latest?.macd != null ? latest.macd.toFixed(3) : "—" },
            { label: "SMA20",      value: latest?.sma20 != null ? `₹${fmt(latest.sma20)}` : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "0.857rem" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Period selector + Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["chart","table"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "5px 14px", borderRadius: "var(--border-radius)", fontWeight: 600,
                border: "none", cursor: "pointer", fontSize: "0.786rem",
                background: tab === t ? "var(--accent)" : "var(--surface-03)",
                color: tab === t ? "#fff" : "var(--text-secondary)" }}>
              {t === "chart" ? "📈 Chart" : "📋 OHLCV Table"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: "4px 10px", borderRadius: "var(--border-radius)",
                border: `1px solid ${period === key ? "var(--accent)" : "var(--border)"}`,
                background: period === key ? "rgba(99,102,241,0.15)" : "var(--surface-03)",
                color: period === key ? "var(--accent-bright)" : "var(--text-secondary)",
                cursor: "pointer", fontSize: "0.786rem", fontWeight: period === key ? 700 : 500 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {tab === "chart" && (
        <div className="card">
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center",
            justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex",
              alignItems: "center", gap: 6 }}>
              <Activity size={14} style={{ color: "var(--accent-bright)" }} />
              Technical Indicators · {data?.count ?? 0} bars
            </span>
            <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
              RSI(14) · MACD(12,26,9) · SMA(20) · EMA(12) · ohlcv_daily
            </span>
          </div>
          {loading && !chartFeatures.length ? (
            <div style={{ height: 300, display: "flex", alignItems: "center",
              justifyContent: "center", color: "var(--text-tertiary)" }}>
              Loading OHLCV data for {SYM}…
            </div>
          ) : chartFeatures.length ? (
            <TechnicalChart data={chartFeatures} symbol={SYM} height={460} />
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center",
              justifyContent: "center", flexDirection: "column", gap: 8,
              color: "var(--text-tertiary)" }}>
              <BarChart2 size={32} style={{ opacity: 0.3 }} />
              <div>No OHLCV data in database for {SYM}</div>
              <div style={{ fontSize: "0.714rem" }}>
                Run: <code style={{ background: "var(--surface-03)", padding: "2px 6px",
                  borderRadius: 3, fontFamily: "var(--font-mono)" }}>
                  python scripts/ingest_ohlcv.py --symbol {SYM} --period 1y
                </code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OHLCV Table */}
      {tab === "table" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              OHLCV History — {data?.count ?? 0} bars
            </span>
            <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
              Source: ohlcv_daily (PostgreSQL)
            </span>
          </div>
          {data?.bars?.length ? (
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <table className="kp-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Open</th>
                    <th style={{ textAlign: "right" }}>High</th>
                    <th style={{ textAlign: "right" }}>Low</th>
                    <th style={{ textAlign: "right" }}>Close</th>
                    <th style={{ textAlign: "right" }}>Volume</th>
                    <th style={{ textAlign: "right" }}>Change%</th>
                    <th style={{ textAlign: "right" }}>RSI</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.bars].reverse().map((bar) => {
                    const barUp = bar.change_pct >= 0;
                    return (
                      <tr key={bar.trade_date}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                          color: "var(--text-secondary)" }}>{bar.trade_date}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem" }}>
                          ₹{fmt(bar.open)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                          color: "var(--color-up)" }}>₹{fmt(bar.high)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                          color: "var(--color-down)" }}>₹{fmt(bar.low)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                          fontWeight: 700 }}>₹{fmt(bar.close)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem" }}>
                          {fmtVol(bar.volume)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                          fontWeight: 700, color: barUp ? "var(--color-up)" : "var(--color-down)" }}>
                          {fmtPct(bar.change_pct)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                          color: bar.rsi != null ? (bar.rsi < 30 ? "var(--color-up)" : bar.rsi > 70 ? "var(--color-down)" : "var(--text-secondary)") : "var(--text-tertiary)" }}>
                          {bar.rsi?.toFixed(1) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
              {loading ? "Loading…" : `No OHLCV data for ${SYM}`}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
