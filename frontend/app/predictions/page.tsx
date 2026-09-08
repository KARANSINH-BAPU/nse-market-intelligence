"use client";
/**
 * KP — Predictions (Technical Signals with BUY/SELL)
 * Shows RSI/MACD/SMA based BUY/SELL signals for all NSE stocks.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Zap, RefreshCw, AlertTriangle, Filter } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Signal {
  symbol: string; name: string; sector: string|null;
  signal_type: string; strength: string; description: string;
  rsi: number|null; macd: number|null; close: number; change_pct: number;
  trade_date: string;
}
interface ScanResult { signals: Signal[]; total: number; scanned: number; trade_date: string; }

const ACTION: Record<string, { label: string; action: "BUY"|"SELL"|"WATCH"; color: string; bg: string }> = {
  RSI_OVERSOLD:   { label: "RSI Oversold",   action: "BUY",   color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  MACD_BULL:      { label: "MACD Bullish",   action: "BUY",   color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  SMA_BULL:       { label: "Above SMA20",    action: "BUY",   color: "#34d399", bg: "rgba(52,211,153,0.10)" },
  RSI_OVERBOUGHT: { label: "RSI Overbought", action: "SELL",  color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  MACD_BEAR:      { label: "MACD Bearish",   action: "SELL",  color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  SMA_BEAR:       { label: "Below SMA20",    action: "SELL",  color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
};

export default function PredictionsPage() {
  const [data,     setData]     = useState<ScanResult|null>(null);
  const [loading,  setLoading]  = useState(false);
  const [view,     setView]     = useState<"all"|"buy"|"sell">("all");
  const [strength, setStrength] = useState("");
  const [sort,     setSort]     = useState("signal_type");

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "500" });
      if (strength) p.set("strength", strength);
      const r = await fetch(`${API}/api/v1/signals?${p}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, [strength]);

  useEffect(() => { scan(); }, []);

  const allSigs = data?.signals ?? [];
  const buySigs  = allSigs.filter(s => ACTION[s.signal_type]?.action === "BUY");
  const sellSigs = allSigs.filter(s => ACTION[s.signal_type]?.action === "SELL");
  const shown    = view === "buy" ? buySigs : view === "sell" ? sellSigs : allSigs;

  // Sort
  const sorted = [...shown].sort((a, b) => {
    if (sort === "change_pct") return b.change_pct - a.change_pct;
    if (sort === "rsi") return (a.rsi ?? 50) - (b.rsi ?? 50);
    if (sort === "close") return b.close - a.close;
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={20} style={{ color: "#6366f1" }} /> Predictions — BUY / SELL Signals
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            RSI(14) · MACD(12,26,9) · SMA(20) signals ·
            {data?.scanned.toLocaleString("en-IN")} stocks scanned · {allSigs.length} signals ·
            📈 {buySigs.length} BUY · 📉 {sellSigs.length} SELL · {data?.trade_date}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={strength} onChange={e => setStrength(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="">All Strengths</option>
            <option value="STRONG">Strong Only</option>
            <option value="MODERATE">Moderate Only</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="signal_type">Sort: Signal Type</option>
            <option value="change_pct">Sort: Change %</option>
            <option value="rsi">Sort: RSI</option>
            <option value="close">Sort: Price</option>
          </select>
          <button onClick={scan} style={{ display: "flex", alignItems: "center", gap: 5,
            background: "var(--accent)", border: "none", color: "#fff",
            borderRadius: "var(--border-radius)", padding: "6px 14px",
            cursor: "pointer", fontSize: "0.786rem", fontWeight: 600 }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* BUY/SELL filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([
          { id: "all",  label: `All (${allSigs.length})`,  col: "var(--accent-bright)" },
          { id: "buy",  label: `▲ BUY (${buySigs.length})`,  col: "var(--color-up)" },
          { id: "sell", label: `▼ SELL (${sellSigs.length})`, col: "var(--color-down)" },
        ] as const).map(({ id, label, col }) => (
          <button key={id} onClick={() => setView(id as any)}
            style={{ padding: "7px 18px", borderRadius: "var(--border-radius)", fontWeight: 700,
              border: `2px solid ${view === id ? col : "transparent"}`,
              background: view === id ? `${col}18` : "var(--surface-03)",
              color: view === id ? col : "var(--text-tertiary)",
              cursor: "pointer", fontSize: "0.857rem", transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "8px 14px", marginBottom: 14,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Technical signals only — NOT financial advice. Always do your own research before trading.
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th style={{ textAlign: "center" }}>Signal</th>
              <th style={{ textAlign: "center" }}>Action</th>
              <th style={{ textAlign: "right" }}>Close ₹</th>
              <th style={{ textAlign: "right" }}>Change %</th>
              <th style={{ textAlign: "right" }}>RSI</th>
              <th style={{ textAlign: "right" }}>MACD</th>
              <th style={{ textAlign: "center" }}>Strength</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "50px 0",
                color: "var(--text-tertiary)" }}>
                <RefreshCw size={20} style={{ animation: "spin 1s linear infinite",
                  margin: "0 auto 8px", display: "block" }} />
                Scanning {data?.scanned.toLocaleString("en-IN") ?? ""}+ stocks for signals…
              </td></tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "50px 0",
                color: "var(--text-tertiary)" }}>No signals found for selected filter</td></tr>
            )}
            {!loading && sorted.slice(0, 200).map((s, i) => {
              const a = ACTION[s.signal_type];
              if (!a) return null;
              return (
                <tr key={`${s.symbol}-${i}`}>
                  <td>
                    <Link href={`/instruments/${s.symbol}`}
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: "var(--accent-bright)", textDecoration: "none" }}>
                      {s.symbol}
                    </Link>
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)", maxWidth: 200 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }}>{s.name}</span>
                    {s.sector && <span style={{ fontSize: "0.643rem", color: "var(--text-tertiary)" }}>{s.sector}</span>}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem",
                      fontWeight: 700, background: a.bg, color: a.color }}>{a.label}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 4, fontSize: "0.786rem",
                      fontWeight: 800, letterSpacing: "0.05em",
                      background: a.action === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      color: a.action === "BUY" ? "var(--color-up)" : "var(--color-down)",
                      border: `1px solid ${a.action === "BUY" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}` }}>
                      {a.action === "BUY" ? "▲ BUY" : "▼ SELL"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    ₹{s.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: s.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                    {s.change_pct >= 0 ? "+" : ""}{s.change_pct.toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                    color: s.rsi != null ? (s.rsi < 30 ? "var(--color-up)" : s.rsi > 70 ? "var(--color-down)" : "var(--text-secondary)") : "var(--text-tertiary)" }}>
                    {s.rsi?.toFixed(1) ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                    color: s.macd != null ? (s.macd >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                    {s.macd?.toFixed(3) ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: "0.714rem",
                      fontWeight: 700,
                      background: s.strength === "STRONG" ? "rgba(99,102,241,0.15)" : "var(--surface-03)",
                      color: s.strength === "STRONG" ? "var(--accent-bright)" : "var(--text-tertiary)" }}>
                      {s.strength}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > 200 && (
        <div style={{ textAlign: "center", padding: "12px", fontSize: "0.786rem",
          color: "var(--text-tertiary)" }}>
          Showing top 200 of {sorted.length} signals. Use filters to narrow down.
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
