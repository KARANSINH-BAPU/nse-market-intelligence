"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SystemStatus } from "@/components/ui/SystemStatus";
import { api, MarketSnapshot, MarketStatus, InstrumentSummary } from "@/lib/api";
import {
  TrendingUp, TrendingDown, Activity, Zap,
  BarChart2, Brain, Radar, AlertTriangle, RefreshCw,
  Search, Circle,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// ── Ticker Strip ───────────────────────────────────────────
function TickerStrip({ snapshot }: { snapshot: MarketSnapshot | null }) {
  const indices = ["NIFTY50", "BANKNIFTY"];
  const phase = snapshot?.phase ?? "—";

  const phaseLabel: Record<string, string> = {
    market_hours:  "MARKET OPEN",
    pre_open:      "PRE-OPEN",
    post_close:    "MARKET CLOSED",
    pre_session:   "PRE-SESSION",
    closed_weekend:"WEEKEND",
  };

  return (
    <div className="ticker-strip" aria-label="Market indices">
      {indices.map((sym) => {
        const q = snapshot?.indices?.[sym];
        const up = q?.change != null && q.change >= 0;
        return (
          <div key={sym} className="ticker-item">
            <span className="ticker-label">{sym === "NIFTY50" ? "NIFTY 50" : "BANK NIFTY"}</span>
            <span className="ticker-value" style={{ color: q?.ltp ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              {q?.ltp ? fmt(q.ltp) : "—"}
            </span>
            <span className={`ticker-change ${q?.ltp ? (up ? "up" : "down") : "flat"}`}>
              {q?.ltp ? fmtPct(q.change_pct) : <span className="data-source unavail">UNAVAIL</span>}
            </span>
          </div>
        );
      })}
      <div className="ticker-item" style={{ marginLeft: "auto" }}>
        <span className={`data-source ${snapshot?.is_open ? "live" : "stale"}`}>
          {phaseLabel[phase] ?? phase.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ── Index Card ─────────────────────────────────────────────
function IndexCard({
  label, symbol, snapshot, icon: Icon,
}: {
  label: string; symbol: string;
  snapshot: MarketSnapshot | null; icon: React.ElementType;
}) {
  const q = snapshot?.indices?.[symbol];
  const hasData = q?.ltp != null;
  const up = hasData && (q!.change ?? 0) >= 0;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="card-title">{label}</span>
        <Icon size={16} color="var(--text-tertiary)" />
      </div>
      {hasData ? (
        <div>
          <div className="stat-value">{fmt(q!.ltp)}</div>
          <div className={`stat-sub ${up ? "up" : "down"}`} style={{ marginTop: 4 }}>
            {fmt(q!.change)} ({fmtPct(q!.change_pct)})
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="data-source live">LIVE · yfinance</span>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.214rem", color: "var(--text-tertiary)" }}>—</div>
          <div style={{ marginTop: 4 }}>
            <span className="data-source unavail">
              {snapshot ? "UNAVAILABLE" : "LOADING…"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Card ────────────────────────────────────────────
function StatusCard({ status }: { status: MarketStatus | null }) {
  if (!status) return (
    <div className="card">
      <span className="card-title">NSE Status</span>
      <div style={{ marginTop: 8 }}><span className="data-source stale">LOADING…</span></div>
    </div>
  );
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="card-title">NSE Status</span>
        <Circle size={10} fill={status.is_open ? "var(--color-up)" : "var(--color-down)"}
          color="transparent" style={{ marginTop: 3 }} />
      </div>
      <div className="stat-value" style={{ fontSize: "1rem" }}>
        {status.is_open ? "OPEN" : "CLOSED"}
      </div>
      <div className="stat-sub flat" style={{ marginTop: 4, fontSize: "0.75rem" }}>
        {status.phase.replace(/_/g, " ").toUpperCase()}
      </div>
      <div style={{ marginTop: 6, fontSize: "0.714rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
        {status.server_time_ist?.slice(11, 19)} IST
      </div>
    </div>
  );
}

// ── Instruments Search Panel ───────────────────────────────
function InstrumentsPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.instruments({ q: query || undefined, page_size: 8 });
        setResults(data.items);
        setTotal(data.total);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
  }, [query]);

  useEffect(() => { setQuery(""); }, []);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={13} /> NSE Instrument Master
        </span>
        <span className="data-source live">{total.toLocaleString()} STOCKS</span>
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          id="instrument-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol or company…"
          style={{
            width: "100%",
            background: "var(--surface-03)",
            border: "1px solid var(--border)",
            borderRadius: "var(--border-radius)",
            color: "var(--text-primary)",
            padding: "7px 12px",
            fontSize: "0.857rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {loading && (
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            fontSize: "0.7rem", color: "var(--text-tertiary)" }}>…</span>
        )}
      </div>
      <table className="kp-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Company</th><th>Type</th><th>F&amp;O</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.symbol}</td>
              <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.company_name ?? "—"}
              </td>
              <td><span className="data-source">{r.instrument_type}</span></td>
              <td style={{ color: r.fno_eligible ? "var(--color-up)" : "var(--text-tertiary)" }}>
                {r.fno_eligible ? "✓" : "—"}
              </td>
            </tr>
          ))}
          {results.length === 0 && !loading && (
            <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: "20px 0" }}>
              {query ? "No results" : "Loading…"}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── AI Signal Panel (honest placeholder) ──────────────────
function AISignalPanel() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Radar size={13} /> Live AI Signals
        </span>
        <span className="data-source unavail">OFFLINE — Phase 10</span>
      </div>
      {[
        { label: "BUY Signals",    count: "—", variant: "up" },
        { label: "SELL Signals",   count: "—", variant: "down" },
        { label: "HOLD Signals",   count: "—", variant: "flat" },
        { label: "WAIT / No Trade",count: "—", variant: "warn" },
      ].map((item) => (
        <div key={item.label} style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>{item.label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600,
            color: item.variant === "up" ? "var(--color-up)"
              : item.variant === "down" ? "var(--color-down)"
              : item.variant === "warn" ? "var(--color-warn)"
              : "var(--text-tertiary)" }}>{item.count}</span>
        </div>
      ))}
      <div style={{ marginTop: 10, fontSize: "0.714rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={11} />
        ML models initialize in Phase 10. All signals will be real model outputs only.
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export function Dashboard() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [mStatus, setMStatus] = useState<MarketStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [snap, stat] = await Promise.all([
        api.marketSnapshot().catch(() => null),
        api.marketStatus().catch(() => null),
      ]);
      setSnapshot(snap);
      setMStatus(stat);
      setLastRefresh(new Date());
    } finally { setRefreshing(false); }
  }, []);

  // Initial fetch + auto-refresh every 30s during market hours
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <>
      <TickerStrip snapshot={snapshot} />

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* Phase banner */}
        <div style={{
          background: "var(--accent-dim)", border: "1px solid var(--accent)",
          borderRadius: "var(--border-radius-lg)", padding: "12px 20px",
          marginBottom: 20, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Zap size={16} color="var(--accent-bright)" />
            <div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                KP Platform — Phase 3
              </span>
              <span style={{ marginLeft: 10, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                {snapshot?.is_open
                  ? "Market OPEN — live data via yfinance"
                  : `Market ${mStatus?.phase?.replace(/_/g, " ") ?? "—"} · 2,583 NSE equities loaded`}
              </span>
            </div>
          </div>
          <button
            id="refresh-btn"
            onClick={refresh}
            disabled={refreshing}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--surface-04)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              padding: "5px 12px", cursor: "pointer", fontSize: "0.786rem",
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {lastRefresh ? `${lastRefresh.toLocaleTimeString("en-IN")}` : "Refresh"}
          </button>
        </div>

        {/* Market overview cards */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Activity size={15} color="var(--accent-bright)" />
            <h2 style={{ fontSize: "0.928rem", fontWeight: 600 }}>Market Overview</h2>
          </div>
          <div className="dashboard-grid">
            <IndexCard label="NIFTY 50"   symbol="NIFTY50"   snapshot={snapshot} icon={TrendingUp} />
            <IndexCard label="BANK NIFTY" symbol="BANKNIFTY" snapshot={snapshot} icon={BarChart2} />
            <StatusCard status={mStatus} />
            <div className="card">
              <span className="card-title">INDIA VIX</span>
              <div style={{ marginTop: 8 }}><span className="data-source unavail">PENDING</span></div>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 6 }}>
                Add VIX to yfinance fetch
              </div>
            </div>
            <div className="card">
              <span className="card-title">Instruments Loaded</span>
              <div className="stat-value" style={{ marginTop: 8 }}>2,583</div>
              <div className="stat-sub flat" style={{ marginTop: 4 }}>NSE Equities · LIVE DB</div>
            </div>
            <div className="card">
              <span className="card-title">Data Source</span>
              <div style={{ marginTop: 8 }}>
                <span className="data-source live">yfinance</span>
              </div>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 6 }}>
                NSE · EQUITY_L.CSV ingested
              </div>
            </div>
          </div>
        </div>

        {/* Main panels */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
          <InstrumentsPanel />
          <div>
            <AISignalPanel />
            <div style={{ marginTop: 16 }}>
              <div className="card">
                <div className="card-header">
                  <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Brain size={13} /> KP Market Brain
                  </span>
                  <span className="data-source unavail">PHASE 10</span>
                </div>
                <div style={{ padding: "16px 0", textAlign: "center" }}>
                  <Brain size={28} color="var(--text-tertiary)" style={{ margin: "0 auto 10px" }} />
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.857rem", marginBottom: 4 }}>
                    Activates when ML models are trained
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
                    Foundation → Data → Features → Models
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Activity size={15} color="var(--accent-bright)" />
            <h2 style={{ fontSize: "0.928rem", fontWeight: 600 }}>System Status</h2>
          </div>
          <SystemStatus compact={false} />
        </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
