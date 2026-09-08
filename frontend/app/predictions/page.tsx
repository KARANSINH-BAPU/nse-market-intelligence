"use client";
/**
 * KP — Technical Signals / Predictions Page
 *
 * Scans all NSE stocks and displays RSI/MACD/SMA signals.
 * DISCLAIMER: Technical indicators only — not financial advice.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap, TrendingUp, TrendingDown, RefreshCw, Filter, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Signal {
  symbol: string; name: string; sector: string | null;
  signal_type: string; strength: string; description: string;
  rsi: number | null; macd: number | null; macd_signal: number | null;
  close: number; sma20: number | null; change_pct: number; trade_date: string;
}

const SIGNAL_META: Record<string, { label: string; color: string; bg: string; dir: "up" | "dn" }> = {
  RSI_OVERSOLD:   { label: "RSI Oversold (<30)",    color: "var(--color-up)",   bg: "rgba(34,197,94,0.1)",   dir: "up" },
  RSI_OVERBOUGHT: { label: "RSI Overbought (>70)",  color: "var(--color-down)", bg: "rgba(239,68,68,0.1)",   dir: "dn" },
  MACD_BULL:      { label: "MACD Bullish Cross",    color: "var(--color-up)",   bg: "rgba(34,197,94,0.1)",   dir: "up" },
  MACD_BEAR:      { label: "MACD Bearish Cross",    color: "var(--color-down)", bg: "rgba(239,68,68,0.1)",   dir: "dn" },
  SMA_BULL:       { label: "Above SMA20",           color: "var(--color-up)",   bg: "rgba(34,197,94,0.08)",  dir: "up" },
  SMA_BEAR:       { label: "Below SMA20",           color: "var(--color-down)", bg: "rgba(239,68,68,0.08)",  dir: "dn" },
};

const STRENGTH_COLORS: Record<string, string> = {
  STRONG:   "rgba(99,102,241,0.2)",
  MODERATE: "rgba(148,163,184,0.15)",
  WEAK:     "rgba(148,163,184,0.1)",
};

export default function PredictionsPage() {
  const [signals,    setSignals]    = useState<Signal[]>([]);
  const [total,      setTotal]      = useState(0);
  const [scanned,    setScanned]    = useState(0);
  const [tradeDate,  setTradeDate]  = useState("");
  const [loading,    setLoading]    = useState(false);
  const [sigFilter,  setSigFilter]  = useState("");
  const [strength,   setStrength]   = useState("");
  const [lastAt,     setLastAt]     = useState<Date | null>(null);

  const fetchSignals = useCallback(async (sf = sigFilter, st = strength) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "200" });
      if (sf) p.set("signal_type", sf);
      if (st) p.set("strength", st);
      const r = await fetch(`${API}/api/v1/signals?${p}`);
      if (r.ok) {
        const d = await r.json();
        setSignals(d.signals || []);
        setTotal(d.total || 0);
        setScanned(d.scanned || 0);
        setTradeDate(d.trade_date || "");
        setLastAt(new Date());
      }
    } finally { setLoading(false); }
  }, [sigFilter, strength]);

  useEffect(() => { fetchSignals(); }, []);

  const onSigFilter = (v: string) => { setSigFilter(v); fetchSignals(v, strength); };
  const onStrength  = (v: string) => { setStrength(v);  fetchSignals(sigFilter, v); };

  // Count by type
  const counts: Record<string, number> = {};
  for (const s of signals) counts[s.signal_type] = (counts[s.signal_type] || 0) + 1;
  const strong = signals.filter(s => s.strength === "STRONG").length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={20} style={{ color: "#f59e0b" }} /> Technical Signals
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            {scanned.toLocaleString("en-IN")} stocks scanned · {total} signals found · {strong} strong
            {tradeDate ? ` · ${tradeDate}` : ""}
          </p>
        </div>
        <button onClick={() => fetchSignals()} style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem",
        }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Rescan
        </button>
      </div>

      {/* Disclaimer */}
      <div style={{
        background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: "var(--border-radius)", padding: "10px 14px",
        marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start",
      }}>
        <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
          <strong style={{ color: "#f59e0b" }}>Disclaimer:</strong> All signals are computed from technical indicators
          (RSI, MACD, SMA20) using real NSE OHLCV data. They are <strong>NOT financial advice</strong> and
          do <strong>NOT predict future prices</strong>. Always do your own research before trading.
        </div>
      </div>

      {/* Signal type summary badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(SIGNAL_META).map(([type, meta]) => (
          <button key={type} onClick={() => onSigFilter(sigFilter === type ? "" : type)}
            id={`sig-filter-${type.toLowerCase()}`}
            style={{
              padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
              background: sigFilter === type ? meta.bg : "var(--surface-03)",
              border: `1px solid ${sigFilter === type ? meta.color : "var(--border)"}`,
              color: sigFilter === type ? meta.color : "var(--text-secondary)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
            {meta.dir === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {meta.label}
            {counts[type] ? <span style={{ opacity: 0.7 }}>({counts[type]})</span> : null}
          </button>
        ))}
        <select value={strength} onChange={e => onStrength(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: "var(--border-radius)",
            background: "var(--surface-03)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: "0.786rem", cursor: "pointer" }}>
          <option value="">All Strengths</option>
          <option value="STRONG">Strong</option>
          <option value="MODERATE">Moderate</option>
          <option value="WEAK">Weak</option>
        </select>
      </div>

      {/* Signals Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Signal</th>
              <th style={{ textAlign: "center" }}>Strength</th>
              <th style={{ textAlign: "right" }}>RSI(14)</th>
              <th style={{ textAlign: "right" }}>MACD</th>
              <th style={{ textAlign: "right" }}>LTP ₹</th>
              <th style={{ textAlign: "right" }}>vs SMA20</th>
              <th style={{ textAlign: "right" }}>Change%</th>
              <th>Sector</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
                Scanning {scanned || "all"} stocks for RSI/MACD/SMA signals…
              </td></tr>
            )}
            {!loading && signals.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>
                No signals found for selected filters
              </td></tr>
            )}
            {signals.map((s, i) => {
              const meta = SIGNAL_META[s.signal_type];
              const chgUp = s.change_pct >= 0;
              const smaDiff = s.sma20 ? ((s.close - s.sma20) / s.sma20 * 100) : null;
              return (
                <tr key={`${s.symbol}-${i}`}>
                  <td>
                    <Link href={`/instruments/${s.symbol}`} style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", textDecoration: "none",
                    }}>{s.symbol}</Link>
                    <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{s.name}</div>
                  </td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: meta?.bg ?? "var(--surface-03)",
                      color: meta?.color ?? "var(--text-secondary)",
                      padding: "2px 8px", borderRadius: 4,
                      fontSize: "0.75rem", fontWeight: 600,
                    }}>
                      {meta?.dir === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {meta?.label ?? s.signal_type}
                    </span>
                    <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                      {s.description}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem", fontWeight: 700,
                      background: STRENGTH_COLORS[s.strength] ?? "var(--surface-03)",
                      color: s.strength === "STRONG" ? "var(--accent-bright)" : "var(--text-secondary)",
                    }}>{s.strength}</span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)",
                    color: s.rsi != null ? (s.rsi < 30 ? "var(--color-up)" : s.rsi > 70 ? "var(--color-down)" : "var(--text-primary)") : "var(--text-tertiary)",
                    fontWeight: 600 }}>
                    {s.rsi != null ? s.rsi.toFixed(1) : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                    color: s.macd != null ? (s.macd >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                    {s.macd != null ? s.macd.toFixed(3) : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    ₹{s.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                    color: smaDiff != null ? (smaDiff >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                    {smaDiff != null ? `${smaDiff >= 0 ? "+" : ""}${smaDiff.toFixed(1)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)",
                    color: chgUp ? "var(--color-up)" : "var(--color-down)", fontWeight: 600 }}>
                    {chgUp ? "+" : ""}{s.change_pct.toFixed(2)}%
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
                    {s.sector || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: "0.643rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Signals computed from RSI(14), MACD(12,26,9), SMA20 · Source: ohlcv_daily (yfinance) · {tradeDate}
        · Technical indicators only — not financial advice
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
