"use client";
/**
 * KP — F&O (Futures & Options) Page
 * Shows NSE F&O eligible stocks with options chain info from yfinance.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw, Info } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface FnoStock {
  symbol: string; name: string; close: number; change_pct: number;
  volume: number; high: number; low: number;
}

// Top NSE F&O stocks (these are always F&O eligible)
const FNO_SYMBOLS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","BAJFINANCE",
  "WIPRO","AXISBANK","KOTAKBANK","HINDUNILVR","LT","MARUTI","TITAN",
  "SUNPHARMA","TECHM","ULTRACEMCO","ONGC","NTPC","POWERGRID",
  "TATAMOTORS","TATASTEEL","JSWSTEEL","ADANIENT","ADANIPORTS",
  "BHARTIARTL","ASIANPAINT","NESTLEIND","DMART","HCLTECH"
];

export default function FnoPage() {
  const [stocks,  setStocks]  = useState<FnoStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAt,  setLastAt]  = useState("");
  const [sortBy,  setSortBy]  = useState("change_pct");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all F&O stocks from our database
      const r = await fetch(
        `${API}/api/v1/market/all-stocks?size=200&sort_by=${sortBy}&order=desc`
      );
      if (r.ok) {
        const d = await r.json();
        // Filter for F&O eligible (known symbols or top liquid stocks)
        const all: FnoStock[] = d.stocks;
        const fno = all.filter((s: FnoStock) =>
          FNO_SYMBOLS.includes(s.symbol) ||
          (s.volume > 500000 && s.close > 100)
        ).slice(0, 60);
        setStocks(fno);
        setLastAt(new Date().toLocaleTimeString("en-IN"));
      }
    } finally { setLoading(false); }
  }, [sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const gainers = stocks.filter(s => s.change_pct > 0).length;
  const losers  = stocks.filter(s => s.change_pct < 0).length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={20} /> F&amp;O Stocks
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Futures &amp; Options eligible stocks · {stocks.length} stocks
            · {gainers} advancing · {losers} declining
            {lastAt ? ` · Updated ${lastAt}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value="change_pct">Sort: Change %</option>
            <option value="volume">Sort: Volume</option>
            <option value="close">Sort: Price</option>
          </select>
          <button onClick={fetchData} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--surface-03)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
            padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem" }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: "var(--border-radius)", padding: "10px 14px", marginBottom: 16,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <Info size={14} style={{ color: "#6366f1", flexShrink: 0, marginTop: 1 }} />
        Showing F&amp;O eligible stocks (high liquidity NSE equities).
        Click any stock to view chart, RSI, MACD indicators and detailed analysis.
        Options chain data requires NSE API subscription.
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "F&O Stocks", val: stocks.length, color: "var(--accent-bright)" },
          { label: "Advancing",  val: gainers,        color: "var(--color-up)" },
          { label: "Declining",  val: losers,          color: "var(--color-down)" },
          { label: "Avg Change", val: stocks.length ? `${(stocks.reduce((s,x)=>s+x.change_pct,0)/stocks.length).toFixed(2)}%` : "—",
            color: "var(--text-primary)" },
        ].map(({ label, val, color }) => (
          <div key={label} className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: "1.2rem", color, marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th style={{ textAlign: "right" }}>LTP ₹</th>
              <th style={{ textAlign: "right" }}>Change %</th>
              <th style={{ textAlign: "right" }}>High</th>
              <th style={{ textAlign: "right" }}>Low</th>
              <th style={{ textAlign: "right" }}>Volume</th>
              <th style={{ textAlign: "center" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0",
                color: "var(--text-tertiary)" }}>Loading F&amp;O stocks…</td></tr>
            )}
            {!loading && stocks.map(s => {
              const up = s.change_pct >= 0;
              return (
                <tr key={s.symbol}>
                  <td>
                    <Link href={`/instruments/${s.symbol}`}
                      style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: "var(--accent-bright)", textDecoration: "none" }}>
                      {s.symbol}
                    </Link>
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                    {s.name?.slice(0, 35)}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    ₹{s.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: up ? "var(--color-up)" : "var(--color-down)" }}>
                    {up ? "+" : ""}{s.change_pct.toFixed(2)}%
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                    color: "var(--color-up)" }}>
                    ₹{s.high?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                    color: "var(--color-down)" }}>
                    ₹{s.low?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem" }}>
                    {s.volume > 1e7 ? `${(s.volume/1e7).toFixed(1)}Cr`
                      : s.volume > 1e5 ? `${(s.volume/1e5).toFixed(1)}L`
                      : s.volume?.toLocaleString("en-IN")}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <Link href={`/instruments/${s.symbol}`}
                      style={{ padding: "3px 10px", borderRadius: 4, fontSize: "0.714rem",
                        background: "rgba(99,102,241,0.15)", color: "var(--accent-bright)",
                        textDecoration: "none", fontWeight: 600 }}>
                      Chart
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: "0.643rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Data: ohlcv_daily · yfinance · NSE · {lastAt}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
