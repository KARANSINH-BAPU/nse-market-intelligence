"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, IndexQuote, OHLCVResponse } from "@/lib/api";
import {
  TrendingUp, TrendingDown, ArrowLeft, RefreshCw,
  BarChart2, Activity, Database, ExternalLink,
} from "lucide-react";

// Lazy-load recharts chart (reduces initial bundle)
const TechnicalChart = dynamic(
  () => import("@/components/charts/TechnicalChart"),
  { ssr: false, loading: () => <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>Loading chart…</div> }
);

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtVol(n: number | null | undefined) {
  if (!n) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
}

export default function InstrumentDetailPage() {
  const { symbol } = useParams() as { symbol: string };
  const SYM = symbol?.toUpperCase();

  const [quote, setQuote]     = useState<IndexQuote | null>(null);
  const [ohlcv, setOhlcv]     = useState<OHLCVResponse | null>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [period, setPeriod]   = useState("1mo");
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt]   = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!SYM) return;
    setLoading(true);
    try {
      const [q, o] = await Promise.all([
        api.quote(SYM).catch(() => null),
        api.ohlcv(SYM, period, "1d").catch(() => null),
      ]);
      setQuote(q);
      setOhlcv(o);
      setLastAt(new Date());
      // Fetch features (252 bars) for chart
      try {
        const f = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/features/${SYM}?lookback=252`);
        if (f.ok) { const fd = await f.json(); setFeatures(fd.features ?? []); }
      } catch { /* features are optional */ }
    } finally { setLoading(false); }
  }, [SYM, period]);

  useEffect(() => { refresh(); }, [refresh]);

  const up = quote?.change != null && quote.change >= 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
        fontSize: "0.857rem", color: "var(--text-secondary)" }}>
        <Link href="/instruments" style={{ color: "var(--text-secondary)",
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={13} /> Instruments
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{SYM}</span>
      </div>

      {/* Quote hero */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800,
                fontFamily: "var(--font-mono)" }}>{SYM}</h1>
              <span className="data-source live">NSE · EQ</span>
              <span className="data-source">yfinance</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: "2.2rem", fontWeight: 700,
                fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {quote?.ltp ? `₹${fmt(quote.ltp)}` : "—"}
              </span>
              {quote?.change != null && (
                <span style={{ fontSize: "1rem", color: up ? "var(--color-up)" : "var(--color-down)",
                  fontFamily: "var(--font-mono)" }}>
                  {up ? <TrendingUp size={14} style={{ display: "inline", marginRight: 4 }} />
                       : <TrendingDown size={14} style={{ display: "inline", marginRight: 4 }} />}
                  {fmt(quote.change)} ({fmtPct(quote.change_pct)})
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <button id="refresh-detail" onClick={refresh} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6,
                background: "var(--surface-04)", border: "1px solid var(--border)",
                color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
                padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem" }}>
              <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              {lastAt ? lastAt.toLocaleTimeString("en-IN") : "Refresh"}
            </button>
            {quote?.ltp && (
              <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                Auto-refresh · real-time data
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        {quote && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            {[
              { label: "Prev Close", value: fmt(quote.prev_close) },
              { label: "Open",       value: (quote as any).open ? `₹${fmt((quote as any).open)}` : "—" },
              { label: "Day High",   value: (quote as any).day_high ? `₹${fmt((quote as any).day_high)}` : "—" },
              { label: "Day Low",    value: (quote as any).day_low ? `₹${fmt((quote as any).day_low)}` : "—" },
              { label: "Volume",     value: fmtVol((quote as any).volume) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OHLCV Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={13} /> OHLCV History
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {["1mo", "3mo", "6mo", "1y"].map(p => (
              <button key={p} id={`period-${p}`}
                onClick={() => { setPeriod(p); }}
                style={{
                  background: period === p ? "var(--accent-dim)" : "var(--surface-04)",
                  border: `1px solid ${period === p ? "var(--accent)" : "var(--border)"}`,
                  color: period === p ? "var(--accent-bright)" : "var(--text-secondary)",
                  borderRadius: "var(--border-radius)", padding: "3px 10px",
                  cursor: "pointer", fontSize: "0.786rem",
                }}>{p}</button>
            ))}
          </div>
        </div>

        {ohlcv && ohlcv.bars.length > 0 ? (
          <table className="kp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="mono">Open</th>
                <th className="mono">High</th>
                <th className="mono">Low</th>
                <th className="mono">Close</th>
                <th className="mono">Volume</th>
                <th className="mono">Change%</th>
              </tr>
            </thead>
            <tbody>
              {[...ohlcv.bars].reverse().map((bar, i) => {
                const prev = ohlcv.bars[ohlcv.bars.length - 2 - i];
                const chgPct = prev ? ((bar.close - prev.close) / prev.close * 100) : null;
                const barUp = chgPct != null && chgPct >= 0;
                return (
                  <tr key={bar.timestamp}>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {bar.timestamp.slice(0, 10)}
                    </td>
                    <td className="mono">{fmt(bar.open)}</td>
                    <td className="mono" style={{ color: "var(--color-up)" }}>{fmt(bar.high)}</td>
                    <td className="mono" style={{ color: "var(--color-down)" }}>{fmt(bar.low)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{fmt(bar.close)}</td>
                    <td className="mono">{fmtVol(bar.volume)}</td>
                    <td className="mono" style={{ color: barUp ? "var(--color-up)" : "var(--color-down)" }}>
                      {chgPct != null ? fmtPct(chgPct) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: "32px 0",
            color: "var(--text-tertiary)", fontSize: "0.857rem" }}>
            {loading ? "Loading OHLCV data…"
              : "No OHLCV data. Run: python scripts/ingest_ohlcv.py --symbol " + SYM}
          </div>
        )}
        {ohlcv && (
          <div style={{ marginTop: 10, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
            {ohlcv.count} bars · source: {ohlcv.source} · {ohlcv.interval} interval
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Technical Chart */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header" style={{ marginBottom: 16 }}>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={14} /> Technical Indicators
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {features.length > 0 && (
              <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                {features.length} bars · RSI/MACD/EMA
              </span>
            )}
            <span className="data-source">ohlcv_daily</span>
          </div>
        </div>
        <TechnicalChart data={features} symbol={SYM} height={500} />
      </div>
    </div>
  );
}
