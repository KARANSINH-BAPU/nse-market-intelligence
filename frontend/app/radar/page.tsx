"use client";
/**
 * KP — AI Radar (Technical Signal Scanner) — Fixed v2
 * Scans all NSE stocks for RSI/MACD/SMA signals using /api/v1/signals
 * + shows top 20 with OHLCV mini-bars.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Radar, RefreshCw, TrendingUp, TrendingDown, Zap, AlertTriangle, Filter } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Signal {
  symbol: string; name: string | null; sector: string | null;
  signal_type: string; strength: string; description: string;
  rsi: number | null; macd: number | null; close: number;
  change_pct: number; trade_date: string;
}

const SIGNAL_META: Record<string, { label: string; action: "BUY" | "SELL"; color: string; bg: string; icon: string }> = {
  RSI_OVERSOLD:   { label: "RSI < 30",       action: "BUY",  color: "#22c55e", bg: "rgba(34,197,94,0.1)",  icon: "▲" },
  MACD_BULL:      { label: "MACD Bullish",   action: "BUY",  color: "#10b981", bg: "rgba(16,185,129,0.1)", icon: "▲" },
  SMA_BULL:       { label: "Above SMA20",    action: "BUY",  color: "#34d399", bg: "rgba(52,211,153,0.1)", icon: "▲" },
  RSI_OVERBOUGHT: { label: "RSI > 70",       action: "SELL", color: "#ef4444", bg: "rgba(239,68,68,0.1)",  icon: "▼" },
  MACD_BEAR:      { label: "MACD Bearish",   action: "SELL", color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: "▼" },
  SMA_BEAR:       { label: "Below SMA20",    action: "SELL", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "▼" },
};

export default function RadarPage() {
  const [signals,  setSignals]  = useState<Signal[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [lastAt,   setLastAt]   = useState("");
  const [filter,   setFilter]   = useState<"all" | "buy" | "sell">("all");
  const [strength, setStrength] = useState<"" | "STRONG" | "MODERATE">("");
  const [scanned,  setScanned]  = useState(0);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (strength) params.set("strength", strength);
      const r = await fetch(`${API}/api/v1/signals?${params}`);
      if (r.ok) {
        const d = await r.json();
        setSignals(d.signals ?? []);
        setScanned(d.scanned ?? 0);
        setLastAt(new Date().toLocaleTimeString("en-IN"));
      }
    } finally { setLoading(false); }
  }, [strength]);

  useEffect(() => { scan(); }, []);
  // Auto-refresh every 60s
  useEffect(() => { const id = setInterval(scan, 60000); return () => clearInterval(id); }, [scan]);

  const buySigs  = signals.filter(s => SIGNAL_META[s.signal_type]?.action === "BUY");
  const sellSigs = signals.filter(s => SIGNAL_META[s.signal_type]?.action === "SELL");
  const shown    = filter === "buy" ? buySigs : filter === "sell" ? sellSigs : signals;

  // Group by signal type for the summary cards
  const byType = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Radar size={20} style={{ color: "#6366f1" }} /> AI Radar — Signal Scanner
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            RSI(14) · MACD(12,26,9) · SMA(20) · Scanned {scanned.toLocaleString("en-IN")} stocks ·
            {signals.length} signals found · 📈 {buySigs.length} BUY · 📉 {sellSigs.length} SELL
            {lastAt ? ` · ${lastAt}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={strength} onChange={e => setStrength(e.target.value as any)}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="">All Strengths</option>
            <option value="STRONG">Strong Only</option>
            <option value="MODERATE">Moderate Only</option>
          </select>
          <button onClick={scan}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: "var(--border-radius)", cursor: "pointer",
              fontSize: "0.786rem", fontWeight: 600 }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Scanning…" : "Refresh Scan"}
          </button>
        </div>
      </div>

      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "7px 14px", marginBottom: 14,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Technical signals only — NOT financial advice. All data from real NSE OHLCV (PostgreSQL).
      </div>

      {/* Signal type summary cards */}
      {!loading && signals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))",
          gap: 10, marginBottom: 16 }}>
          {Object.entries(byType).sort(([,a],[,b]) => b-a).map(([type, count]) => {
            const meta = SIGNAL_META[type];
            if (!meta) return null;
            return (
              <div key={type} className="card" style={{ padding: "10px 14px",
                borderColor: `${meta.color}44`,
                background: meta.bg }}>
                <div style={{ fontSize: "0.714rem", color: meta.color, fontWeight: 700 }}>
                  {meta.icon} {meta.label}
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: meta.color }}>{count}</div>
                <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginTop: 1 }}>
                  {meta.action} signals
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BUY / SELL filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([
          { id: "all",  label: `All (${signals.length})`,  col: "var(--accent-bright)" },
          { id: "buy",  label: `▲ BUY (${buySigs.length})`,  col: "var(--color-up)" },
          { id: "sell", label: `▼ SELL (${sellSigs.length})`, col: "var(--color-down)" },
        ] as const).map(({ id, label, col }) => (
          <button key={id} onClick={() => setFilter(id as any)}
            style={{ padding: "6px 16px", borderRadius: "var(--border-radius)", fontWeight: 700,
              border: `2px solid ${filter === id ? col : "transparent"}`,
              background: filter === id ? `${col}18` : "var(--surface-03)",
              color: filter === id ? col : "var(--text-tertiary)",
              cursor: "pointer", fontSize: "0.857rem", transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Signals table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Signal</th>
              <th style={{ textAlign: "center" }}>Action</th>
              <th style={{ textAlign: "right" }}>Price ₹</th>
              <th style={{ textAlign: "right" }}>Change %</th>
              <th style={{ textAlign: "right" }}>RSI(14)</th>
              <th style={{ textAlign: "right" }}>MACD</th>
              <th style={{ textAlign: "center" }}>Strength</th>
              <th>Sector</th>
            </tr>
          </thead>
          <tbody>
            {loading && signals.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", color: "var(--accent-bright)" }} />
                  <div>Scanning {scanned.toLocaleString("en-IN")}+ NSE stocks for signals…</div>
                </div>
              </td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-tertiary)" }}>
                No signals found for this filter. Try "All Strengths".
              </td></tr>
            )}
            {shown.slice(0, 300).map((s, i) => {
              const meta = SIGNAL_META[s.signal_type];
              if (!meta) return null;
              const up = s.change_pct >= 0;
              return (
                <tr key={`${s.symbol}-${s.signal_type}-${i}`}>
                  <td>
                    <Link href={`/instruments/${s.symbol}`}
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: "var(--accent-bright)", textDecoration: "none", fontSize: "0.857rem" }}>
                      {s.symbol}
                    </Link>
                    {s.name && (
                      <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                        {s.name}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem",
                      fontWeight: 700, background: meta.bg, color: meta.color }}>
                      {meta.icon} {meta.label}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 4, fontSize: "0.786rem",
                      fontWeight: 800, letterSpacing: "0.05em",
                      background: meta.action === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      color: meta.action === "BUY" ? "var(--color-up)" : "var(--color-down)",
                      border: `1px solid ${meta.action === "BUY" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}` }}>
                      {meta.action === "BUY" ? "▲ BUY" : "▼ SELL"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    ₹{s.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: up ? "var(--color-up)" : "var(--color-down)" }}>
                    {up ? "+" : ""}{s.change_pct.toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                    fontWeight: 700,
                    color: s.rsi != null ? (s.rsi < 30 ? "var(--color-up)" : s.rsi > 70 ? "var(--color-down)" : "var(--text-secondary)") : "var(--text-tertiary)" }}>
                    {s.rsi?.toFixed(1) ?? "—"}
                    {s.rsi != null && (
                      <span style={{ fontSize: "0.643rem", marginLeft: 3, color: "var(--text-tertiary)" }}>
                        {s.rsi < 30 ? "(OS)" : s.rsi > 70 ? "(OB)" : ""}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                    color: s.macd != null ? (s.macd >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                    {s.macd?.toFixed(3) ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: "0.714rem", fontWeight: 700,
                      background: s.strength === "STRONG" ? "rgba(99,102,241,0.15)" : "var(--surface-03)",
                      color: s.strength === "STRONG" ? "var(--accent-bright)" : "var(--text-tertiary)" }}>
                      {s.strength}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
                    maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.sector ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shown.length > 300 && (
        <div style={{ textAlign: "center", padding: "12px", fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Showing 300 of {shown.length} signals. Use strength filter to narrow down.
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
