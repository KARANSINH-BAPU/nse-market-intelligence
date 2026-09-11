"use client";
/**
 * KP — Markets Page
 * Live index dashboard + NSE-accurate Top Gainers / Losers (Nifty 50)
 */
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, RefreshCw, Activity,
  Wifi, WifiOff, Trophy, ArrowDownCircle,
} from "lucide-react";
import { useMarketTicker } from "@/lib/useMarketTicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SparkLine = dynamic(
  () => import("recharts").then(m => {
    const { AreaChart, Area, ResponsiveContainer } = m;
    function Spark({ data, up }: { data: number[]; up: boolean }) {
      if (data.length < 2) return null;
      const pts = data.map((v, i) => ({ i, v }));
      return (
        <ResponsiveContainer width="100%" height={56}>
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
  { key: "NIFTY 50",     label: "NIFTY 50",     sub: "NSE Benchmark",  size: "large" },
  { key: "BANK NIFTY",   label: "BANK NIFTY",   sub: "Banking Sector", size: "large" },
  { key: "SENSEX",       label: "SENSEX",        sub: "BSE 30",         size: "large" },
  { key: "NIFTY IT",     label: "NIFTY IT",      sub: "Technology",     size: "small" },
  { key: "NIFTY PHARMA", label: "NIFTY PHARMA",  sub: "Pharma",         size: "small" },
  { key: "NIFTY AUTO",   label: "NIFTY AUTO",    sub: "Automobiles",    size: "small" },
  { key: "NIFTY FMCG",   label: "NIFTY FMCG",    sub: "FMCG",           size: "small" },
  { key: "NIFTY METAL",  label: "NIFTY METAL",   sub: "Metals",         size: "small" },
  { key: "NIFTY ENERGY", label: "NIFTY ENERGY",  sub: "Energy",         size: "small" },
  { key: "NIFTY INFRA",  label: "NIFTY INFRA",   sub: "Infrastructure", size: "small" },
  { key: "NIFTY MIDCAP", label: "NIFTY MIDCAP",  sub: "Mid Cap 50",     size: "small" },
];

interface IState { ltp: number | null; change: number | null; changePct: number | null; ticks: number[]; }
const INIT: Record<string, IState> = Object.fromEntries(
  INDICES.map(({ key }) => [key, { ltp: null, change: null, changePct: null, ticks: [] }])
);

interface Mover {
  symbol: string; ltp: number; open: number | null; high: number | null;
  low: number | null; prev_close: number | null; change: number; change_pct: number;
  volume: number; value_lakhs?: number;
}

function fmt(n: number | null) {
  return n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtPct(n: number | null) {
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtVol(n: number | null) {
  if (!n) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  return n.toLocaleString("en-IN");
}

export default function MarketsPage() {
  const [indices,   setIndices]   = useState<Record<string, IState>>(INIT);
  const [loading,   setLoading]   = useState(false);
  const [mktStatus, setStatus]    = useState<"open" | "closed" | "unknown">("unknown");
  const [lastAt,    setLastAt]    = useState("");
  const [gainers,   setGainers]   = useState<Mover[]>([]);
  const [losers,    setLosers]    = useState<Mover[]>([]);
  const [glLoading, setGlLoading] = useState(false);
  const [glLive,    setGlLive]    = useState(false);
  const [glDate,    setGlDate]    = useState("");
  const [moversTab, setMoversTab] = useState<"gainers" | "losers">("gainers");

  const { connected, lastTick } = useMarketTicker(["market"]);

  // ── REST snapshot ──────────────────────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/market/snapshot`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return;
      const d = await r.json();
      setStatus(d.is_open ? "open" : "closed");
      setLastAt(new Date().toLocaleTimeString("en-IN"));
      if (d.indices) {
        const KEY_MAP: Record<string, string> = {
          NIFTY50: "NIFTY 50", BANKNIFTY: "BANK NIFTY", SENSEX: "SENSEX",
          NIFTYIT: "NIFTY IT", NIFTYPHARMA: "NIFTY PHARMA", NIFTYAUTO: "NIFTY AUTO",
          NIFTYFMCG: "NIFTY FMCG", NIFTYMETAL: "NIFTY METAL",
          NIFTYENERGY: "NIFTY ENERGY", NIFTYINFRA: "NIFTY INFRA", NIFTYMIDCAP: "NIFTY MIDCAP",
          "NIFTY 50": "NIFTY 50", "BANK NIFTY": "BANK NIFTY", "NIFTY BANK": "BANK NIFTY",
          "NIFTY IT": "NIFTY IT", "NIFTY PHARMA": "NIFTY PHARMA",
        };
        setIndices(prev => {
          const next = { ...prev };
          for (const [rawKey, v] of Object.entries(d.indices as Record<string, any>)) {
            const k = KEY_MAP[rawKey] ?? rawKey;
            if (!next[k]) next[k] = { ltp: null, change: null, changePct: null, ticks: [] };
            next[k] = { ...next[k], ltp: v.ltp, change: v.change, changePct: v.change_pct,
              ticks: [...next[k].ticks.slice(-99), v.ltp].filter(Boolean) };
          }
          return next;
        });
      }
    } catch { } finally { setLoading(false); }
  }, []);

  // ── Gainers / Losers fetch ─────────────────────────────────────────────────
  const fetchMovers = useCallback(async () => {
    setGlLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=20`,
        { signal: AbortSignal.timeout(35000) });
      if (!r.ok) return;
      const d = await r.json();
      setGainers(d.gainers ?? []);
      setLosers(d.losers ?? []);
      setGlLive(d.live ?? false);
      setGlDate(d.as_of ?? "");
    } catch (e) {
      // silent fail — show stale data
    } finally { setGlLoading(false); }
  }, []);

  useEffect(() => { fetchSnapshot(); fetchMovers(); }, []);

  useEffect(() => {
    const id = setInterval(fetchSnapshot, 15000);
    return () => clearInterval(id);
  }, [fetchSnapshot]);

  // Refresh movers every 3 min
  useEffect(() => {
    const id = setInterval(fetchMovers, 180000);
    return () => clearInterval(id);
  }, [fetchMovers]);

  // WebSocket tick updates
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
        padding: large ? "20px 22px" : "14px 16px",
        background: s.ltp != null
          ? `linear-gradient(135deg, var(--surface-02), ${up ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)"})`
          : "var(--surface-02)",
        borderColor: s.ltp != null ? (up ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)") : undefined,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: large ? "1rem" : "0.857rem" }}>{idx.label}</div>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{idx.sub}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800,
              fontSize: large ? "1.4rem" : "1.05rem", color: col }}>
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
          : <div style={{ height: large ? 72 : 48, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-tertiary)", fontSize: "0.714rem", opacity: 0.7 }}>
              {loading ? "Loading…" : connected ? "Fetching data…" : "Offline — reconnecting"}
            </div>}
      </div>
    );
  }

  // ── Gainers / Losers table ────────────────────────────────────────────────
  const moversData = moversTab === "gainers" ? gainers : losers;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={22} /> Markets
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            Live index dashboard · NSE/BSE · {lastAt ? `Updated ${lastAt}` : "Loading…"}
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
          <button onClick={() => { fetchSnapshot(); fetchMovers(); }} style={{
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 12 }}>
        {largeIndices.map(idx => <IndexCard key={idx.key} idx={idx} large />)}
      </div>

      {/* Sector indices */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 28 }}>
        {smallIndices.map(idx => <IndexCard key={idx.key} idx={idx} />)}
      </div>

      {/* Top Gainers / Losers — NSE Style */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {/* Section header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 0 }}>
            <button onClick={() => setMoversTab("gainers")}
              style={{ padding: "7px 20px", fontWeight: 700, fontSize: "0.857rem", cursor: "pointer",
                background: moversTab === "gainers" ? "rgba(34,197,94,0.12)" : "transparent",
                border: "none", borderBottom: moversTab === "gainers" ? "2px solid var(--color-up)" : "2px solid transparent",
                color: moversTab === "gainers" ? "var(--color-up)" : "var(--text-tertiary)",
                display: "flex", alignItems: "center", gap: 6 }}>
              <Trophy size={14} /> Top 20 Gainers
            </button>
            <button onClick={() => setMoversTab("losers")}
              style={{ padding: "7px 20px", fontWeight: 700, fontSize: "0.857rem", cursor: "pointer",
                background: moversTab === "losers" ? "rgba(239,68,68,0.1)" : "transparent",
                border: "none", borderBottom: moversTab === "losers" ? "2px solid var(--color-down)" : "2px solid transparent",
                color: moversTab === "losers" ? "var(--color-down)" : "var(--text-tertiary)",
                display: "flex", alignItems: "center", gap: 6 }}>
              <ArrowDownCircle size={14} /> Top 20 Losers
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
              NIFTY 50 · {glDate} ·&nbsp;
              <span style={{ color: glLive ? "var(--color-up)" : "#f59e0b", fontWeight: 600 }}>
                {glLive ? "🟢 Live" : "🟡 EOD"}
              </span>
            </span>
            <button onClick={fetchMovers}
              style={{ padding: "4px 10px", borderRadius: "var(--border-radius)", fontSize: "0.714rem",
                background: "var(--surface-03)", border: "1px solid var(--border)",
                color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={10} style={{ animation: glLoading ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
          </div>
        </div>

        {/* NSE-style table */}
        <div style={{ overflowX: "auto" }}>
          <table className="kp-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th style={{ textAlign: "right" }}>OPEN</th>
                <th style={{ textAlign: "right" }}>HIGH</th>
                <th style={{ textAlign: "right" }}>LOW</th>
                <th style={{ textAlign: "right" }}>PREV. CLOSE</th>
                <th style={{ textAlign: "right" }}>LTP</th>
                <th style={{ textAlign: "right" }}>%CHANGE</th>
                <th style={{ textAlign: "right" }}>VOLUME</th>
                <th style={{ textAlign: "right" }}>VALUE (₹L)</th>
              </tr>
            </thead>
            <tbody>
              {glLoading && moversData.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)" }}>
                  <RefreshCw size={16} style={{ animation: "spin 1s linear infinite", margin: "0 auto 6px", display: "block" }} />
                  Fetching live Nifty 50 data from NSE…
                </td></tr>
              )}
              {!glLoading && moversData.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)" }}>
                  No data — click Refresh to load
                </td></tr>
              )}
              {moversData.map((m, i) => {
                const up = m.change_pct >= 0;
                return (
                  <tr key={m.symbol}>
                    <td>
                      <Link href={`/instruments/${m.symbol}`}
                        style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                          color: "var(--accent-bright)", textDecoration: "none" }}>
                        {m.symbol}
                      </Link>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem" }}>
                      {fmt(m.open)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      color: "var(--color-up)" }}>
                      {fmt(m.high)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      color: "var(--color-down)" }}>
                      {fmt(m.low)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      color: "var(--text-secondary)" }}>
                      {fmt(m.prev_close)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 800,
                      fontSize: "0.9rem", color: up ? "var(--color-up)" : "var(--color-down)" }}>
                      {fmt(m.ltp)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: up ? "var(--color-up)" : "var(--color-down)" }}>
                      {up ? "+" : ""}{m.change_pct.toFixed(2)}%
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                      color: "var(--text-secondary)" }}>
                      {fmtVol(m.volume)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                      color: "var(--text-secondary)" }}>
                      {m.value_lakhs ? m.value_lakhs.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        Data source: yfinance · NSE/BSE · REST polling every 15s · WebSocket live push
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
