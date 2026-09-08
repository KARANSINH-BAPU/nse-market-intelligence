"use client";
/**
 * KP — AI Radar
 * Scans ALL NSE stocks for technical signals + momentum patterns.
 * Shows real RSI/MACD/SMA signals in a radar-style heatmap.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radar, TrendingUp, TrendingDown, RefreshCw, Zap, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RadarSignal {
  symbol: string; name: string; sector: string|null;
  signal_type: string; strength: string; description: string;
  rsi: number|null; macd: number|null; close: number; change_pct: number;
  trade_date: string;
}

interface ScanResult {
  signals: RadarSignal[];
  total: number; scanned: number; trade_date: string; timestamp: string;
}

const SIG_COLOR: Record<string,string> = {
  RSI_OVERSOLD:   "#22c55e", RSI_OVERBOUGHT: "#ef4444",
  MACD_BULL:      "#22c55e", MACD_BEAR:      "#ef4444",
  SMA_BULL:       "#10b981", SMA_BEAR:       "#f59e0b",
};
const SIG_LABEL: Record<string,string> = {
  RSI_OVERSOLD:   "RSI Oversold", RSI_OVERBOUGHT: "RSI Overbought",
  MACD_BULL:      "MACD Bullish", MACD_BEAR:      "MACD Bearish",
  SMA_BULL:       "Above SMA20",  SMA_BEAR:       "Below SMA20",
};

export default function RadarPage() {
  const [data,     setData]     = useState<ScanResult|null>(null);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("");
  const [strength, setStrength] = useState("");

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "300" });
      if (filter)   p.set("signal_type", filter);
      if (strength) p.set("strength", strength);
      const r = await fetch(`${API}/api/v1/signals?${p}`);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, [filter, strength]);

  useEffect(() => { scan(); }, []);

  const signals = data?.signals ?? [];
  const bullish  = signals.filter(s => ["RSI_OVERSOLD","MACD_BULL","SMA_BULL"].includes(s.signal_type));
  const bearish  = signals.filter(s => ["RSI_OVERBOUGHT","MACD_BEAR","SMA_BEAR"].includes(s.signal_type));

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Radar size={20} style={{ color: "#6366f1" }} /> AI Radar
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Real-time technical scan · {data?.scanned.toLocaleString("en-IN")} stocks scanned ·
            {signals.length} signals · {bullish.length} bullish · {bearish.length} bearish
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={filter} onChange={e => { setFilter(e.target.value); }}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="">All Signals</option>
            <option value="RSI_OVERSOLD">RSI Oversold</option>
            <option value="RSI_OVERBOUGHT">RSI Overbought</option>
            <option value="MACD_BULL">MACD Bullish</option>
            <option value="MACD_BEAR">MACD Bearish</option>
          </select>
          <select value={strength} onChange={e => setStrength(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="">All Strengths</option>
            <option value="STRONG">Strong</option>
            <option value="MODERATE">Moderate</option>
          </select>
          <button onClick={scan} style={{ display: "flex", alignItems: "center", gap: 5,
            background: "var(--accent)", border: "none", color: "#fff",
            borderRadius: "var(--border-radius)", padding: "6px 14px",
            cursor: "pointer", fontSize: "0.786rem", fontWeight: 600 }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Scan Now
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: "var(--border-radius)", padding: "8px 14px", marginBottom: 16,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        <span><strong style={{ color: "#f59e0b" }}>Disclaimer:</strong> RSI/MACD/SMA signals only.
          Not financial advice. Past signals do not guarantee future performance.</span>
      </div>

      {/* Two columns: bullish / bearish */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Bullish */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
            fontWeight: 700, color: "var(--color-up)" }}>
            <TrendingUp size={16} /> Bullish Signals ({bullish.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>Scanning…</div>}
            {!loading && bullish.slice(0, 30).map((s, i) => (
              <Link key={`${s.symbol}-${i}`} href={`/instruments/${s.symbol}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "10px 14px", cursor: "pointer",
                  borderColor: "rgba(34,197,94,0.2)",
                  transition: "border-color 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        fontSize: "0.9rem", color: "var(--accent-bright)" }}>{s.symbol}</span>
                      <span style={{ marginLeft: 8, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                        {s.name?.slice(0, 25)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: "0.714rem",
                        background: `${SIG_COLOR[s.signal_type]}22`,
                        color: SIG_COLOR[s.signal_type], fontWeight: 700 }}>
                        {SIG_LABEL[s.signal_type]}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem", fontWeight: 700,
                        color: s.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                        {s.change_pct >= 0 ? "+" : ""}{s.change_pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  {s.rsi != null && (
                    <div style={{ marginTop: 4, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                      RSI: <strong style={{ color: s.rsi < 30 ? "var(--color-up)" : "var(--color-down)" }}>
                        {s.rsi.toFixed(1)}
                      </strong>
                      {s.macd != null && <> · MACD: <strong style={{ color: s.macd >= 0 ? "var(--color-up)" : "var(--color-down)" }}>{s.macd.toFixed(3)}</strong></>}
                      · ₹{s.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Bearish */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
            fontWeight: 700, color: "var(--color-down)" }}>
            <TrendingDown size={16} /> Bearish Signals ({bearish.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>Scanning…</div>}
            {!loading && bearish.slice(0, 30).map((s, i) => (
              <Link key={`${s.symbol}-${i}`} href={`/instruments/${s.symbol}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "10px 14px", cursor: "pointer",
                  borderColor: "rgba(239,68,68,0.2)", transition: "border-color 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        fontSize: "0.9rem", color: "var(--accent-bright)" }}>{s.symbol}</span>
                      <span style={{ marginLeft: 8, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                        {s.name?.slice(0, 25)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: "0.714rem",
                        background: `${SIG_COLOR[s.signal_type]}22`,
                        color: SIG_COLOR[s.signal_type], fontWeight: 700 }}>
                        {SIG_LABEL[s.signal_type]}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem", fontWeight: 700,
                        color: s.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                        {s.change_pct >= 0 ? "+" : ""}{s.change_pct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Signals from RSI(14), MACD(12,26,9), SMA(20) · Source: ohlcv_daily · {data?.trade_date}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
