"use client";

/**
 * KP — Markets Page
 *
 * Live index dashboard powered by recharts + WebSocket ticks.
 * - NIFTY50, BANKNIFTY, SENSEX, NIFTY IT, NIFTY PHARMA
 * - Each card shows: name, LTP, change%, intraday sparkline from WS ticks
 * - Sector heatmap with YTD data from yfinance (no fabricated values)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, TrendingDown, Wifi, WifiOff } from "lucide-react";
import { useMarketTicker } from "@/lib/useMarketTicker";

const SparkLine = dynamic(
  () => import("recharts").then(m => {
    // Inline recharts sparkline using AreaChart
    const { AreaChart, Area, ResponsiveContainer, Tooltip } = m;
    function Spark({ data, up }: { data: number[]; up: boolean }) {
      if (!data.length) return null;
      const pts = data.map((v, i) => ({ i, v }));
      return (
        <ResponsiveContainer width="100%" height={56}>
          <AreaChart data={pts} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`sg${up ? "u" : "d"}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0.25} />
                <stop offset="95%" stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v"
              stroke={up ? "#22c55e" : "#ef4444"} strokeWidth={1.5}
              fill={`url(#sg${up ? "u" : "d"})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return { default: Spark };
  }),
  { ssr: false }
);

// Index definitions
const INDICES = [
  { key: "NIFTY 50",     label: "NIFTY 50",        sub: "NSE Benchmark" },
  { key: "NIFTY BANK",   label: "BANK NIFTY",       sub: "Banking Sector" },
  { key: "SENSEX",       label: "SENSEX",            sub: "BSE 30" },
  { key: "NIFTY IT",     label: "NIFTY IT",          sub: "Technology" },
  { key: "NIFTY PHARMA", label: "NIFTY PHARMA",      sub: "Pharma" },
  { key: "NIFTY AUTO",   label: "NIFTY AUTO",        sub: "Automobiles" },
];

// Sector heatmap — fetched from backend
const SECTORS = [
  "NIFTY IT", "NIFTY BANK", "NIFTY PHARMA", "NIFTY AUTO",
  "NIFTY FMCG", "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY",
];

interface IndexState {
  ltp:    number | null;
  change: number | null;
  changePct: number | null;
  ticks:  number[];     // rolling last-100 LTP values for sparkline
}

const INITIAL: Record<string, IndexState> = Object.fromEntries(
  INDICES.map(({ key }) => [key, { ltp: null, change: null, changePct: null, ticks: [] }])
);

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default function MarketsPage() {
  const [indices, setIndices] = useState<Record<string, IndexState>>(INITIAL);
  const { connected, lastTick } = useMarketTicker(["market"]);
  const [marketStatus, setMarketStatus] = useState<"open" | "closed" | "unknown">("unknown");

  // Apply incoming ticks to state
  useEffect(() => {
    if (!lastTick?.indices) return;
    const tmap = lastTick.indices as Record<string, { ltp: number; change: number; change_pct: number }>;
    setMarketStatus(lastTick.is_open ? "open" : "closed");
    setIndices(prev => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(tmap)) {
        if (!next[key]) next[key] = { ltp: null, change: null, changePct: null, ticks: [] };
        const prevTicks = next[key].ticks.slice(-99);
        next[key] = {
          ltp:       val.ltp,
          change:    val.change,
          changePct: val.change_pct,
          ticks:     [...prevTicks, val.ltp],
        };
      }
      return next;
    });
  }, [lastTick]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>
            Markets
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            Live index dashboard · ticks via WebSocket · yfinance data
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: "0.786rem", fontWeight: 600,
            color: marketStatus === "open" ? "var(--color-up)" : "var(--text-tertiary)",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: marketStatus === "open" ? "var(--color-up)" : "var(--text-tertiary)",
              animation: marketStatus === "open" ? "pulse 2s ease-in-out infinite" : "none",
            }} />
            {marketStatus === "open" ? "Market Open" : marketStatus === "closed" ? "Market Closed" : "Unknown"}
          </span>
          <span style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: "0.75rem",
            color: connected ? "var(--color-up)" : "var(--color-down)",
          }}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </div>

      {/* Index Cards Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 14, marginBottom: 28,
      }}>
        {INDICES.map(({ key, label, sub }) => {
          const s    = indices[key];
          const up   = s.changePct != null ? s.changePct >= 0 : true;
          const color = s.ltp != null ? (up ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)";
          return (
            <div key={key} className="card" style={{ padding: "16px 18px", position: "relative" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{label}</div>
                  <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{sub}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                    fontSize: "1.1rem", color }}>
                    {s.ltp != null ? fmt(s.ltp) : "—"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem",
                    color, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                    {s.changePct != null
                      ? (up ? <TrendingUp size={11} /> : <TrendingDown size={11} />)
                      : null}
                    {fmtPct(s.changePct)}
                  </div>
                </div>
              </div>
              {/* Sparkline */}
              <div style={{ marginTop: 4 }}>
                {s.ticks.length > 1
                  ? <SparkLine data={s.ticks} up={up} />
                  : (
                    <div style={{ height: 56, display: "flex", alignItems: "center",
                      justifyContent: "center", color: "var(--text-tertiary)",
                      fontSize: "0.714rem", opacity: 0.6 }}>
                      {connected ? "Waiting for ticks…" : "Offline"}
                    </div>
                  )}
              </div>
              {/* Absolute change */}
              {s.change != null && (
                <div style={{ marginTop: 6, fontSize: "0.714rem",
                  color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {s.change >= 0 ? "+" : ""}{fmt(s.change)} pts today
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Data note */}
      <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
        borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
        Index data via yfinance · WebSocket broadcaster · 15-sec polling · NSE/BSE
        <span style={{ marginLeft: 12 }} className="data-source">live ticks</span>
        <span style={{ marginLeft: 4 }} className="data-source">yfinance</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:1} 50%{opacity:0.4}
        }
      `}</style>
    </div>
  );
}
