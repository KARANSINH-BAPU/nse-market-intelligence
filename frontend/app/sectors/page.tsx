"use client";
/**
 * KP — Sectors Page
 * Real sector performance from ohlcv_daily + instruments table.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PieChart, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Sector {
  sector: string; avg_change_pct: number; stock_count: number;
  advances: number; declines: number;
  top_gainer: string | null; top_loser: string | null;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAt,  setLastAt]  = useState<Date | null>(null);

  const fetchSectors = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/market/sector-performance`);
      if (r.ok) { setSectors(await r.json()); setLastAt(new Date()); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSectors(); }, [fetchSectors]);

  const topSector    = sectors[0];
  const bottomSector = sectors[sectors.length - 1];
  const advancing    = sectors.filter(s => s.avg_change_pct >= 0).length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={20} /> Sectors
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            {sectors.length} sectors · {advancing} advancing · {sectors.length - advancing} declining
            {lastAt ? ` · Updated ${lastAt.toLocaleTimeString("en-IN")}` : ""}
          </p>
        </div>
        <button onClick={fetchSectors} style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem",
        }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      {topSector && bottomSector && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Best Sector",  val: topSector.sector,    pct: topSector.avg_change_pct,    up: true },
            { label: "Worst Sector", val: bottomSector.sector, pct: bottomSector.avg_change_pct, up: false },
            { label: "Advancing",    val: `${advancing} sectors`, pct: null, up: true, sub: `${sectors.length - advancing} declining` },
            { label: "Total Sectors", val: `${sectors.length}`, pct: null, up: null, sub: "NSE listed" },
          ].map(({ label, val, pct, up, sub }) => (
            <div key={label} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{val}</div>
              {pct != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, marginTop: 2,
                  color: up ? "var(--color-up)" : "var(--color-down)" }}>
                  {fmtPct(pct)}
                </div>
              )}
              {sub && <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Sector heatmap grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {sectors.map(s => {
          const up = s.avg_change_pct >= 0;
          const intensity = Math.min(Math.abs(s.avg_change_pct) / 4, 1);
          const bgR = up ? `rgba(34,197,94,${0.06 + intensity * 0.28})` : `rgba(239,68,68,${0.06 + intensity * 0.28})`;
          const border = up ? `rgba(34,197,94,${0.2 + intensity * 0.5})` : `rgba(239,68,68,${0.2 + intensity * 0.5})`;
          const advPct = s.stock_count > 0 ? Math.round((s.advances / s.stock_count) * 100) : 0;
          return (
            <div key={s.sector} style={{
              background: bgR, border: `1px solid ${border}`,
              borderRadius: "var(--border-radius)", padding: "16px 18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>{s.sector}</div>
                  <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                    {s.stock_count} stocks
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.3rem",
                  color: up ? "var(--color-up)" : "var(--color-down)" }}>
                  {fmtPct(s.avg_change_pct)}
                </div>
              </div>

              {/* Advance/Decline bar */}
              <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 8 }}>
                <div style={{ width: `${advPct}%`, background: "var(--color-up)", transition: "width 0.8s" }} />
                <div style={{ flex: 1, background: "var(--color-down)", opacity: 0.6 }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.714rem" }}>
                <span style={{ color: "var(--color-up)" }}>↑ {s.advances} adv</span>
                <span style={{ color: "var(--color-down)" }}>↓ {s.declines} dec</span>
              </div>

              {(s.top_gainer || s.top_loser) && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8,
                  fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                  {s.top_gainer && (
                    <Link href={`/instruments/${s.top_gainer}`} style={{ color: "var(--color-up)", textDecoration: "none" }}>
                      ↑ {s.top_gainer}
                    </Link>
                  )}
                  {s.top_loser && (
                    <Link href={`/instruments/${s.top_loser}`} style={{ color: "var(--color-down)", textDecoration: "none" }}>
                      ↓ {s.top_loser}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sectors.length === 0 && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
          No sector data available — ensure OHLCV is ingested and instruments have sector data
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: "0.714rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Source: ohlcv_daily + instruments · yfinance · Real NSE data
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
