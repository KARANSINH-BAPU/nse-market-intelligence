"use client";

import { useEffect, useRef, useState } from "react";
import { useMarketTicker } from "@/lib/useMarketTicker";
import { api } from "@/lib/api";
import {
  Activity, TrendingUp, TrendingDown, Minus,
  Wifi, WifiOff, RefreshCw, Clock,
} from "lucide-react";

// ── Mini sparkline drawn with SVG ───────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 56 }} />;
  const w = 280, h = 56, pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h} ${pts.join(" ")} ${w - pad},${h}`}
        fill={`url(#grad-${color.replace("#","")})`}
      />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Last point dot */}
      <circle
        cx={pts[pts.length - 1].split(",")[0]}
        cy={pts[pts.length - 1].split(",")[1]}
        r="3" fill={color}
      />
    </svg>
  );
}

// ── Index card ───────────────────────────────────────────────────────────────
function IndexCard({
  name, symbol, history,
}: { name: string; symbol: string; history: number[] }) {
  const { indices, connected } = useMarketTicker();
  const tick = indices[symbol];
  const up = tick?.change_pct != null && tick.change_pct >= 0;
  const color = tick == null ? "var(--text-tertiary)"
    : up ? "var(--color-up)" : "var(--color-down)";

  function fmt(n: number | null | undefined) {
    if (n == null) return "—";
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="card" style={{ flex: "1 1 260px", minWidth: 240 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
            fontWeight: 600, letterSpacing: "0.06em", marginBottom: 2 }}>{name}</div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800,
            fontFamily: "var(--font-mono)", lineHeight: 1 }}>
            {tick?.ltp != null ? fmt(tick.ltp) : "—"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ color, fontFamily: "var(--font-mono)",
            fontSize: "0.9rem", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 4 }}>
            {tick?.change_pct != null
              ? (up ? <TrendingUp size={14}/> : <TrendingDown size={14}/>)
              : <Minus size={14} />}
            {tick?.change_pct != null
              ? `${up ? "+" : ""}${tick.change_pct.toFixed(2)}%`
              : "—"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem",
            color: "var(--text-tertiary)" }}>
            {tick?.change != null
              ? `${up ? "+" : ""}${fmt(tick.change)}`
              : ""}
          </span>
        </div>
      </div>
      <Sparkline data={history} color={up ? "#22c55e" : "#ef4444"} />
      <div style={{ display: "flex", justifyContent: "space-between",
        marginTop: 6, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
        <span>Source: yfinance</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {connected
            ? <><Wifi size={10} color="var(--color-up)" /> Live</>
            : <><WifiOff size={10} color="var(--color-down)" /> Polling</>}
        </span>
      </div>
    </div>
  );
}

// ── Market breadth bar ───────────────────────────────────────────────────────
function BreadthBar({ advances, declines, unchanged }: {
  advances: number; declines: number; unchanged: number;
}) {
  const total = advances + declines + unchanged || 1;
  const advPct  = (advances  / total * 100).toFixed(1);
  const decPct  = (declines  / total * 100).toFixed(1);
  return (
    <div className="card" style={{ flex: "1 1 100%" }}>
      <div className="card-header">
        <span className="card-title">Market Breadth · NSE</span>
        <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
          {total.toLocaleString()} active
        </span>
      </div>
      <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { label: "Advances",  value: advances, color: "var(--color-up)" },
          { label: "Declines",  value: declines, color: "var(--color-down)" },
          { label: "Unchanged", value: unchanged, color: "var(--text-tertiary)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 700,
              fontFamily: "var(--font-mono)", color }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
          </div>
        ))}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: advances > declines ? "var(--color-up)" : "var(--color-down)" }}>
            {(advances / (declines || 1)).toFixed(2)}
          </div>
          <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>A/D Ratio</div>
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 4, overflow: "hidden",
        display: "flex", background: "var(--surface-03)" }}>
        <div style={{ width: `${advPct}%`, background: "var(--color-up)", transition: "width 1s" }} />
        <div style={{ width: `${decPct}%`, background: "var(--color-down)", transition: "width 1s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 4 }}>
        <span>{advPct}% advances</span>
        <span>{decPct}% declines</span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  const { indices, connected, lastTick, isOpen } = useMarketTicker();

  // Rolling tick history for sparklines (max 60 ticks)
  const niftyHist   = useRef<number[]>([]);
  const bankHist    = useRef<number[]>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (indices["NIFTY50"]?.ltp)   { niftyHist.current.push(indices["NIFTY50"].ltp!); if (niftyHist.current.length > 60) niftyHist.current.shift(); }
    if (indices["BANKNIFTY"]?.ltp) { bankHist.current.push(indices["BANKNIFTY"].ltp!); if (bankHist.current.length > 60) bankHist.current.shift(); }
    forceRender(n => n + 1);
  }, [lastTick]);

  // Static breadth placeholder until we have live breadth feed
  const [breadth] = useState({ advances: 1238, declines: 891, unchanged: 414 });

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={20} />
            Markets
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            NSE live data · yfinance · {isOpen ? "🟢 Market Open" : "🔴 Market Closed"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8,
          fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          {connected
            ? <><Wifi size={12} color="var(--color-up)" /> WebSocket Live</>
            : <><WifiOff size={12} color="var(--color-down)" /> Connecting…</>}
          {lastTick && (
            <span><Clock size={10} style={{ display: "inline" }} />
              &nbsp;{lastTick.toLocaleTimeString("en-IN")}
            </span>
          )}
        </div>
      </div>

      {/* Index cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <IndexCard
          name="NIFTY 50"
          symbol="NIFTY50"
          history={niftyHist.current}
        />
        <IndexCard
          name="BANK NIFTY"
          symbol="BANKNIFTY"
          history={bankHist.current}
        />
      </div>

      {/* Market breadth */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <BreadthBar {...breadth} />
      </div>

      {/* Session info */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Session Details</span>
          <span className="data-source">NSE</span>
        </div>
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          {[
            { label: "Exchange",   value: "NSE" },
            { label: "Segment",    value: "Cash Equity" },
            { label: "Open",       value: "09:15 IST" },
            { label: "Close",      value: "15:30 IST" },
            { label: "Status",     value: isOpen ? "Open" : "Closed",
              color: isOpen ? "var(--color-up)" : "var(--color-down)" },
            { label: "Data Feed",  value: "yfinance v1.7+" },
            { label: "Cache TTL",  value: "15s snapshot / 30s quote" },
            { label: "WebSocket",  value: connected ? "Connected" : "Reconnecting",
              color: connected ? "var(--color-up)" : "var(--text-secondary)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
                marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600,
                color: color ?? "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
