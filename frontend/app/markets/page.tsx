"use client";
/**
 * KP — Markets Page (Fixed)
 * Loads live data via REST snapshot first, then updates via WebSocket ticks.
 * Shows NIFTY 50, BANK NIFTY, SENSEX + sector indices with sparklines.
 */
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, TrendingDown, RefreshCw, Activity, Wifi, WifiOff } from "lucide-react";
import { useMarketTicker } from "@/lib/useMarketTicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SparkLine = dynamic(
  () => import("recharts").then(m => {
    const { AreaChart, Area, ResponsiveContainer } = m;
    function Spark({ data, up }: { data: number[]; up: boolean }) {
      if (data.length < 2) return null;
      const pts = data.map((v, i) => ({ i, v }));
      return (
        <ResponsiveContainer width="100%" height={64}>
          <AreaChart data={pts} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`sg${up ? "u" : "d"}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={up ? "#22c55e" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v"
              stroke={up ? "#22c55e" : "#ef4444"} strokeWidth={2}
              fill={`url(#sg${up ? "u" : "d"})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return { default: Spark };
  }), { ssr: false }
);

const INDICES = [
  { key: "NIFTY 50",       label: "NIFTY 50",       sub: "NSE Benchmark",    size: "large" },
  { key: "BANK NIFTY",     label: "BANK NIFTY",     sub: "Banking Sector",   size: "large" },
  { key: "SENSEX",         label: "SENSEX",          sub: "BSE 30",           size: "large" },
  { key: "NIFTY IT",       label: "NIFTY IT",        sub: "Technology",       size: "small" },
  { key: "NIFTY PHARMA",   label: "NIFTY PHARMA",    sub: "Pharma",           size: "small" },
  { key: "NIFTY AUTO",     label: "NIFTY AUTO",      sub: "Automobiles",      size: "small" },
  { key: "NIFTY FMCG",     label: "NIFTY FMCG",      sub: "FMCG",             size: "small" },
  { key: "NIFTY METAL",    label: "NIFTY METAL",      sub: "Metals",           size: "small" },
  { key: "NIFTY ENERGY",   label: "NIFTY ENERGY",     sub: "Energy",           size: "small" },
  { key: "NIFTY INFRA",    label: "NIFTY INFRA",      sub: "Infrastructure",   size: "small" },
  { key: "NIFTY MIDCAP",   label: "NIFTY MIDCAP",     sub: "Mid Cap 50",       size: "small" },
];

interface IState { ltp: number|null; change: number|null; changePct: number|null; ticks: number[]; }
const INIT: Record<string, IState> = Object.fromEntries(
  INDICES.map(({ key }) => [key, { ltp: null, change: null, changePct: null, ticks: [] }])
);

function fmt(n: number|null) { return n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function fmtPct(n: number|null) { return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

export default function MarketsPage() {
  const [indices,  setIndices]  = useState<Record<string, IState>>(INIT);
  const [loading,  setLoading]  = useState(false);
  const [mktStatus, setStatus]  = useState<"open"|"closed"|"unknown">("unknown");
  const [lastAt,   setLastAt]   = useState("");
  const { connected, lastTick } = useMarketTicker(["market"]);

  // ── REST snapshot on load ──────────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/market/snapshot`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return;
      const d = await r.json();
      setStatus(d.is_open ? "open" : "closed");
      setLastAt(new Date().toLocaleTimeString("en-IN"));
      if (d.indices) {
        // Map backend keys → display keys
        const KEY_MAP: Record<string, string> = {
          NIFTY50:     "NIFTY 50",
          BANKNIFTY:   "BANK NIFTY",
          SENSEX:      "SENSEX",
          NIFTYIT:     "NIFTY IT",
          NIFTYPHARMA: "NIFTY PHARMA",
          NIFTYAUTO:   "NIFTY AUTO",
          NIFTYFMCG:   "NIFTY FMCG",
          NIFTYMETAL:  "NIFTY METAL",
          NIFTYENERGY: "NIFTY ENERGY",
          NIFTYINFRA:  "NIFTY INFRA",
          NIFTYMIDCAP: "NIFTY MIDCAP",
          // also accept already-mapped display keys
          "NIFTY 50":    "NIFTY 50",
          "BANK NIFTY":  "BANK NIFTY",
          "NIFTY BANK":  "BANK NIFTY",
          "NIFTY IT":    "NIFTY IT",
          "NIFTY PHARMA":"NIFTY PHARMA",
          "NIFTY AUTO":  "NIFTY AUTO",
          "NIFTY FMCG":  "NIFTY FMCG",
          "NIFTY METAL": "NIFTY METAL",
          "NIFTY ENERGY":"NIFTY ENERGY",
          "NIFTY INFRA": "NIFTY INFRA",
          "NIFTY MIDCAP":"NIFTY MIDCAP",
        };
        setIndices(prev => {
          const next = { ...prev };
          for (const [rawKey, v] of Object.entries(d.indices as Record<string, any>)) {
            const k = KEY_MAP[rawKey] ?? rawKey;
            if (!next[k]) next[k] = { ltp: null, change: null, changePct: null, ticks: [] };
            next[k] = { ...next[k], ltp: v.ltp, change: v.change, changePct: v.change_pct,
              ticks: [...next[k].ticks.slice(-99), v.ltp] };
          }
          return next;
        });
      }
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  // Auto-refresh every 15s
  useEffect(() => {
    const id = setInterval(fetchSnapshot, 15000);
    return () => clearInterval(id);
  }, [fetchSnapshot]);

  // ── WebSocket tick updates ─────────────────────────────────────────────
  useEffect(() => {
    if (!lastTick?.indices) return;
    const tmap = lastTick.indices as Record<string, any>;
    setStatus(lastTick.is_open ? "open" : "closed");
    setLastAt(new Date().toLocaleTimeString("en-IN"));
    setIndices(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(tmap)) {
        if (!next[k]) next[k] = { ltp: null, change: null, changePct: null, ticks: [] };
        next[k] = { ltp: v.ltp, change: v.change, changePct: v.change_pct,
          ticks: [...next[k].ticks.slice(-99), v.ltp] };
      }
      return next;
    });
  }, [lastTick]);

  const largeIndices = INDICES.filter(i => i.size === "large");
  const smallIndices = INDICES.filter(i => i.size === "small");

  function IndexCard({ idx, large }: { idx: typeof INDICES[0]; large?: boolean }) {
    const s  = indices[idx.key];
    const up = s.changePct != null ? s.changePct >= 0 : true;
    const col = s.ltp != null ? (up ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)";
    return (
      <div className="card" style={{
        padding: large ? "22px 24px" : "16px 18px",
        background: s.ltp != null
          ? `linear-gradient(135deg, var(--surface-02), ${up ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)"})`
          : "var(--surface-02)",
        borderColor: s.ltp != null ? (up ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)") : undefined,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: large ? "1.05rem" : "0.9rem" }}>{idx.label}</div>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{idx.sub}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800,
              fontSize: large ? "1.5rem" : "1.1rem", color: col }}>
              {fmt(s.ltp)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem", color: col,
              display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", fontWeight: 700 }}>
              {s.changePct != null ? (up ? <TrendingUp size={12}/> : <TrendingDown size={12}/>) : null}
              {fmtPct(s.changePct)}
            </div>
            {s.change != null && (
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {s.change >= 0 ? "+" : ""}{fmt(s.change)} pts
              </div>
            )}
          </div>
        </div>
        {s.ticks.length > 1
          ? <SparkLine data={s.ticks} up={up} />
          : <div style={{ height: large ? 80 : 56, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-tertiary)", fontSize: "0.714rem", opacity: 0.7 }}>
              {loading ? "Loading…" : connected ? "Fetching data…" : "Offline — reconnecting"}
            </div>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={22} /> Markets
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            Live index dashboard · yfinance data · {lastAt ? `Updated ${lastAt}` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.786rem",
            color: mktStatus === "open" ? "var(--color-up)" : "var(--text-tertiary)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: mktStatus === "open" ? "var(--color-up)" : "var(--text-tertiary)",
              animation: mktStatus === "open" ? "pulse 2s ease-in-out infinite" : "none" }} />
            {mktStatus === "open" ? "Market Open" : mktStatus === "closed" ? "Market Closed" : "Checking…"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem",
            color: connected ? "var(--color-up)" : "var(--color-down)" }}>
            {connected ? <Wifi size={12}/> : <WifiOff size={12}/>}
            {connected ? "Live" : "Offline"}
          </span>
          <button onClick={fetchSnapshot} style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--surface-03)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
            padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem" }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Big 3 indices */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        {largeIndices.map(idx => <IndexCard key={idx.key} idx={idx} large />)}
      </div>

      {/* Sector indices */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        {smallIndices.map(idx => <IndexCard key={idx.key} idx={idx} />)}
      </div>

      <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        Data source: yfinance · REST polling every 15s · WebSocket live push · NSE/BSE
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @media(max-width:700px) { .markets-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
