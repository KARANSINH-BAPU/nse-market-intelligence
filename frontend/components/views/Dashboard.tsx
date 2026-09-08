"use client";

/**
 * KP — Dashboard Component
 * Complete market overview with:
 * - Market breadth (advances/declines)
 * - Top gainers & losers from real OHLCV
 * - Sector performance heatmap
 * - Technical signals snapshot
 * - Live index quotes
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, Activity, BarChart2,
  RefreshCw, ArrowUpRight, ArrowDownRight, Zap,
  CircleDot, PieChart,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtVol(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

interface Mover {
  symbol: string; name: string; sector: string | null;
  close: number; change: number; change_pct: number; volume: number;
}
interface Breadth {
  advances: number; declines: number; unchanged: number;
  total: number; ratio: number; trade_date: string;
}
interface Sector {
  sector: string; avg_change_pct: number; stock_count: number;
  advances: number; declines: number; top_gainer: string | null; top_loser: string | null;
}
interface SignalSummary {
  symbol: string; signal_type: string; strength: string; rsi: number | null; change_pct: number;
}

const SECTOR_COLORS: Record<string, string> = {
  "Financial Services": "#6366f1",
  "Information Technology": "#06b6d4",
  "Healthcare": "#10b981",
  "Consumer Goods": "#f59e0b",
  "Energy": "#ef4444",
  "Automobile": "#8b5cf6",
  "Metals & Mining": "#64748b",
  "Realty": "#ec4899",
  "Chemicals": "#14b8a6",
  "FMCG": "#f97316",
};

function getSectorColor(s: string) {
  for (const [k, v] of Object.entries(SECTOR_COLORS)) {
    if (s.toLowerCase().includes(k.toLowerCase().split(" ")[0].toLowerCase())) return v;
  }
  return "#94a3b8";
}

const SIGNAL_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  RSI_OVERSOLD:   { label: "RSI Oversold",   color: "var(--color-up)",   icon: "↑" },
  RSI_OVERBOUGHT: { label: "RSI Overbought", color: "var(--color-down)", icon: "↓" },
  MACD_BULL:      { label: "MACD Bullish",   color: "var(--color-up)",   icon: "↑" },
  MACD_BEAR:      { label: "MACD Bearish",   color: "var(--color-down)", icon: "↓" },
  SMA_BULL:       { label: "Above SMA20",    color: "var(--color-up)",   icon: "↑" },
  SMA_BEAR:       { label: "Below SMA20",    color: "var(--color-down)", icon: "↓" },
};

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, href }: {
  icon: React.ReactNode; title: string; subtitle?: string; href?: string;
}) {
  return (
    <div className="card-header" style={{ marginBottom: 16 }}>
      <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {icon} {title}
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {subtitle && <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{subtitle}</span>}
        {href && (
          <Link href={href} style={{
            fontSize: "0.714rem", color: "var(--accent-bright)", textDecoration: "none",
            display: "flex", alignItems: "center", gap: 2,
          }}>View all <ArrowUpRight size={10} /></Link>
        )}
      </div>
    </div>
  );
}

// ── Mover Row ──────────────────────────────────────────────────────────────
function MoverRow({ m, up }: { m: Mover; up: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid var(--border-subtle)",
    }}>
      <div style={{ flex: 1 }}>
        <Link href={`/instruments/${m.symbol}`} style={{ textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.857rem",
            color: "var(--accent-bright)" }}>{m.symbol}</div>
        </Link>
        <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
          {m.sector || m.name}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem" }}>
          ₹{fmt(m.close)}
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "0.786rem", fontWeight: 700,
          color: up ? "var(--color-up)" : "var(--color-down)",
          display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end",
        }}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {fmtPct(m.change_pct)}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export function Dashboard() {
  const [gainers,   setGainers]   = useState<Mover[]>([]);
  const [losers,    setLosers]    = useState<Mover[]>([]);
  const [breadth,   setBreadth]   = useState<Breadth | null>(null);
  const [sectors,   setSectors]   = useState<Sector[]>([]);
  const [signals,   setSignals]   = useState<SignalSummary[]>([]);
  const [tradeDate, setTradeDate] = useState<string>("");
  const [loading,   setLoading]   = useState(true);
  const [lastAt,    setLastAt]    = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [moversRes, breadthRes, sectorRes, sigRes] = await Promise.allSettled([
        fetch(`${API}/api/v1/market/movers?limit=10`).then(r => r.json()),
        fetch(`${API}/api/v1/market/breadth`).then(r => r.json()),
        fetch(`${API}/api/v1/market/sector-performance`).then(r => r.json()),
        fetch(`${API}/api/v1/signals?limit=20&strength=STRONG`).then(r => r.json()),
      ]);

      if (moversRes.status === "fulfilled") {
        setGainers(moversRes.value.gainers || []);
        setLosers(moversRes.value.losers   || []);
        setTradeDate(moversRes.value.trade_date || "");
      }
      if (breadthRes.status === "fulfilled") setBreadth(breadthRes.value);
      if (sectorRes.status === "fulfilled")  setSectors(sectorRes.value || []);
      if (sigRes.status === "fulfilled")     setSignals(sigRes.value.signals || []);
      setLastAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const advPct = breadth ? Math.round((breadth.advances / breadth.total) * 100) : 50;
  const decPct = breadth ? Math.round((breadth.declines / breadth.total) * 100) : 50;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            {tradeDate ? `Session: ${new Date(tradeDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}` : ""}
            {lastAt ? ` · Updated ${lastAt.toLocaleTimeString("en-IN")}` : ""}
          </p>
        </div>
        <button onClick={fetchAll} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem",
        }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Market Breadth Banner */}
      {breadth && (
        <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
              fontSize: "0.9rem" }}>
              <CircleDot size={14} style={{ color: "var(--accent-bright)" }} />
              Market Breadth — {breadth.total.toLocaleString("en-IN")} stocks
            </span>
            <div style={{ display: "flex", gap: 16, fontSize: "0.786rem" }}>
              <span style={{ color: "var(--color-up)" }}>
                ↑ {breadth.advances.toLocaleString("en-IN")} Advances ({advPct}%)
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>
                → {breadth.unchanged} Unchanged
              </span>
              <span style={{ color: "var(--color-down)" }}>
                ↓ {breadth.declines.toLocaleString("en-IN")} Declines ({decPct}%)
              </span>
            </div>
          </div>
          {/* Breadth bar */}
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
            <div style={{ width: `${advPct}%`, background: "var(--color-up)", transition: "width 0.8s ease" }} />
            <div style={{ width: `${100 - advPct - decPct}%`, background: "var(--text-tertiary)", opacity: 0.4 }} />
            <div style={{ width: `${decPct}%`, background: "var(--color-down)", transition: "width 0.8s ease" }} />
          </div>
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Top Gainers */}
        <div className="card">
          <SectionHeader
            icon={<TrendingUp size={14} style={{ color: "var(--color-up)" }} />}
            title="Top Gainers"
            subtitle={`${gainers.length} stocks`}
            href="/stocks?sort_by=change_pct&order=desc"
          />
          {gainers.length === 0 && !loading && (
            <div style={{ color: "var(--text-tertiary)", fontSize: "0.857rem", padding: "20px 0", textAlign: "center" }}>
              No data — run OHLCV ingest
            </div>
          )}
          {gainers.slice(0, 8).map(m => <MoverRow key={m.symbol} m={m} up />)}
        </div>

        {/* Top Losers */}
        <div className="card">
          <SectionHeader
            icon={<TrendingDown size={14} style={{ color: "var(--color-down)" }} />}
            title="Top Losers"
            subtitle={`${losers.length} stocks`}
            href="/stocks?sort_by=change_pct&order=asc"
          />
          {losers.length === 0 && !loading && (
            <div style={{ color: "var(--text-tertiary)", fontSize: "0.857rem", padding: "20px 0", textAlign: "center" }}>
              No data — run OHLCV ingest
            </div>
          )}
          {losers.slice(0, 8).map(m => <MoverRow key={m.symbol} m={m} up={false} />)}
        </div>
      </div>

      {/* Sector Performance Heatmap */}
      {sectors.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionHeader
            icon={<PieChart size={14} style={{ color: "var(--accent-bright)" }} />}
            title="Sector Performance"
            subtitle={`${sectors.length} sectors`}
            href="/sectors"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {sectors.map(s => {
              const up = s.avg_change_pct >= 0;
              const intensity = Math.min(Math.abs(s.avg_change_pct) / 3, 1);
              const bg = up
                ? `rgba(34,197,94,${0.08 + intensity * 0.25})`
                : `rgba(239,68,68,${0.08 + intensity * 0.25})`;
              const border = up
                ? `rgba(34,197,94,${0.2 + intensity * 0.4})`
                : `rgba(239,68,68,${0.2 + intensity * 0.4})`;
              return (
                <Link key={s.sector} href="/sectors" style={{ textDecoration: "none" }}>
                  <div style={{
                    background: bg, border: `1px solid ${border}`,
                    borderRadius: "var(--border-radius)", padding: "10px 12px",
                    cursor: "pointer", transition: "transform 0.15s ease",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.02)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                    <div style={{ fontSize: "0.714rem", color: "var(--text-secondary)",
                      fontWeight: 600, marginBottom: 4,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.sector}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1rem",
                      color: up ? "var(--color-up)" : "var(--color-down)" }}>
                      {fmtPct(s.avg_change_pct)}
                    </div>
                    <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                      ↑{s.advances} ↓{s.declines} · {s.stock_count} stocks
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Technical Signals */}
      {signals.length > 0 && (
        <div className="card">
          <SectionHeader
            icon={<Zap size={14} style={{ color: "#f59e0b" }} />}
            title="Technical Signals"
            subtitle="RSI · MACD · SMA — not financial advice"
            href="/predictions"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {signals.slice(0, 12).map((s, i) => {
              const info = SIGNAL_LABELS[s.signal_type] ?? { label: s.signal_type, color: "var(--text-secondary)", icon: "·" };
              return (
                <Link key={`${s.symbol}-${i}`} href={`/instruments/${s.symbol}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    background: "var(--surface-03)", border: "1px solid var(--border)",
                    borderRadius: "var(--border-radius)", padding: "10px 12px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    transition: "border-color 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                        fontSize: "0.857rem", color: "var(--text-primary)" }}>{s.symbol}</div>
                      <div style={{ fontSize: "0.714rem", color: info.color, fontWeight: 600, marginTop: 2 }}>
                        {info.icon} {info.label}
                      </div>
                      {s.rsi != null && (
                        <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)" }}>
                          RSI {s.rsi.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: "0.643rem", padding: "2px 6px", borderRadius: 4,
                        background: s.strength === "STRONG"
                          ? "rgba(99,102,241,0.15)" : "var(--surface-04)",
                        color: s.strength === "STRONG" ? "var(--accent-bright)" : "var(--text-tertiary)",
                        fontWeight: 700,
                      }}>{s.strength}</span>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.714rem",
                        marginTop: 4,
                        color: s.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                        {fmtPct(s.change_pct)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: "0.643rem", color: "var(--text-tertiary)" }}>
            ⚠ Technical signals only — computed from RSI/MACD/SMA on real OHLCV data. Not financial advice.
            <Link href="/predictions" style={{ marginLeft: 8, color: "var(--accent-bright)", textDecoration: "none" }}>
              View all signals →
            </Link>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
