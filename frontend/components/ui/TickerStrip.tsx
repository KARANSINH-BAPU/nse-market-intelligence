/**
 * KP Frontend — Live Index Ticker Strip
 *
 * Shows NIFTY50, BANKNIFTY, SENSEX as a tight pill strip in the header.
 * Data comes from the useMarketTicker WebSocket hook (real-time) with a
 * REST fallback on first render via the market snapshot endpoint.
 */
"use client";

import { useEffect, useState } from "react";
import { useMarketTicker, IndexTick } from "@/lib/useMarketTicker";
import { TrendingUp, TrendingDown, Wifi, WifiOff } from "lucide-react";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Pill({ name, tick }: { name: string; tick: IndexTick | undefined }) {
  const up = tick?.change_pct != null && tick.change_pct >= 0;
  const color = tick == null ? "var(--text-tertiary)"
    : up ? "var(--color-up)" : "var(--color-down)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      background: "var(--surface-03)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "3px 10px",
      fontSize: "0.75rem",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>{name}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>
        {tick?.ltp != null ? fmt(tick.ltp) : "…"}
      </span>
      {tick?.change_pct != null && (
        <span style={{ color, display: "flex", alignItems: "center", gap: 2, fontFamily: "var(--font-mono)" }}>
          {up
            ? <TrendingUp size={10} />
            : <TrendingDown size={10} />}
          {up ? "+" : ""}{tick.change_pct.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export function TickerStrip() {
  const { indices, connected, lastTick } = useMarketTicker();
  const [pulse, setPulse] = useState(false);

  // Flash on every new tick
  useEffect(() => {
    if (!lastTick) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(t);
  }, [lastTick]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      opacity: pulse ? 0.75 : 1,
      transition: "opacity 0.3s ease",
    }}>
      <Pill name="NIFTY"  tick={indices["NIFTY50"]} />
      <Pill name="BANK"   tick={indices["BANKNIFTY"]} />

      {/* WS connection dot */}
      <div title={connected ? "Live WebSocket" : "Connecting…"} style={{
        width: 6, height: 6, borderRadius: "50%",
        background: connected ? "var(--color-up)" : "var(--color-down)",
        boxShadow: connected ? "0 0 4px var(--color-up)" : "none",
        flexShrink: 0,
        animation: connected ? "pulse-dot 2s ease-in-out infinite" : "none",
      }} />

      <style>{`
        @keyframes pulse-dot {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
