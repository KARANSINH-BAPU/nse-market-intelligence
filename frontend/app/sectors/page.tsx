"use client";
/**
 * KP — Sectors Performance
 * Heatmap + ranked list of sector performance from real OHLCV data.
 */
import { useEffect, useState, useCallback } from "react";
import { PieChart, RefreshCw, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Sector {
  sector: string; avg_change_pct: number; stock_count: number;
  advances: number; declines: number; top_gainer: string|null; top_loser: string|null;
}

// Curated sector → representative stocks mapping for demo
const SECTOR_STOCKS: Record<string, string[]> = {
  "Banking":       ["HDFCBANK","SBIN","ICICIBANK","AXISBANK","KOTAKBANK"],
  "Technology":    ["TCS","INFY","WIPRO","HCLTECH","TECHM"],
  "Pharma":        ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","BIOCON"],
  "Auto":          ["MARUTI","TATAMOTORS","BAJAJ-AUTO","EICHERMOT","HEROMOTOCO"],
  "FMCG":          ["HINDUNILVR","NESTLEIND","BRITANNIA","DABUR","MARICO"],
  "Metals":        ["TATASTEEL","JSWSTEEL","HINDALCO","VEDL","SAIL"],
  "Energy":        ["RELIANCE","ONGC","NTPC","POWERGRID","BPCL"],
  "Real Estate":   ["DLF","GODREJPROP","OBEROIRLTY","PRESTIGE","BRIGADE"],
  "Financial Svcs":["BAJFINANCE","BAJAJFINSV","MUTHOOTFIN","HDFC","SBI"],
  "Chemicals":     ["PIDILITIND","NAVNETEDUL","SRF","AAVAS","CLEAN"],
};

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAt,  setLastAt]  = useState("");
  const [view,    setView]    = useState<"heatmap"|"list">("heatmap");

  const fetchSectors = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/market/sector-performance`);
      if (r.ok) {
        let d: Sector[] = await r.json();
        // If backend only returns "Others", build sectors from movers data
        if (d.length <= 1) {
          // Fallback: fetch all stocks & compute sector stats
          const mr = await fetch(`${API}/api/v1/market/all-stocks?size=200&sort_by=change_pct&order=desc`);
          if (mr.ok) {
            const md = await mr.json();
            // Group by sector field
            const byS: Record<string, { pcts: number[]; adv: number; dec: number }> = {};
            for (const s of md.stocks) {
              const sec = s.sector ?? "Others";
              if (!byS[sec]) byS[sec] = { pcts: [], adv: 0, dec: 0 };
              byS[sec].pcts.push(s.change_pct);
              if (s.change_pct >= 0) byS[sec].adv++;
              else byS[sec].dec++;
            }
            d = Object.entries(byS).map(([sector, v]) => ({
              sector,
              avg_change_pct: parseFloat((v.pcts.reduce((a,b)=>a+b,0)/v.pcts.length).toFixed(2)),
              stock_count: v.pcts.length,
              advances: v.adv,
              declines: v.dec,
              top_gainer: null,
              top_loser:  null,
            })).sort((a,b) => b.avg_change_pct - a.avg_change_pct);
          }
        }
        setSectors(d);
        setLastAt(new Date().toLocaleTimeString("en-IN"));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSectors(); }, [fetchSectors]);

  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avg_change_pct)), 1);

  function HeatCard({ s }: { s: Sector }) {
    const pct  = s.avg_change_pct;
    const up   = pct >= 0;
    const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
    const bg = up
      ? `rgba(34,197,94,${0.08 + intensity * 0.35})`
      : `rgba(239,68,68,${0.08 + intensity * 0.35})`;
    const border = up ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)";
    return (
      <div style={{ padding: "14px 16px", borderRadius: "var(--border-radius)",
        background: bg, border: `1px solid ${border}`, cursor: "default" }}>
        <div style={{ fontWeight: 700, fontSize: "0.857rem", marginBottom: 4,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.sector}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.2rem",
          color: up ? "var(--color-up)" : "var(--color-down)" }}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
        </div>
        <div style={{ fontSize: "0.714rem", color: "var(--text-secondary)", marginTop: 4 }}>
          {s.stock_count} stocks · {s.advances}↑ {s.declines}↓
        </div>
        {s.top_gainer && (
          <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginTop: 2 }}>
            Top: <Link href={`/instruments/${s.top_gainer}`}
              style={{ color: "var(--color-up)", textDecoration: "none" }}>{s.top_gainer}</Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={20} /> Sectors
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Sector performance from real NSE data · {sectors.length} sectors
            {lastAt ? ` · Updated ${lastAt}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView("heatmap")} style={{ padding: "6px 14px",
            borderRadius: "var(--border-radius)", fontWeight: 600, fontSize: "0.786rem",
            background: view === "heatmap" ? "var(--accent)" : "var(--surface-03)",
            border: "none", color: view === "heatmap" ? "#fff" : "var(--text-secondary)",
            cursor: "pointer" }}>Heatmap</button>
          <button onClick={() => setView("list")} style={{ padding: "6px 14px",
            borderRadius: "var(--border-radius)", fontWeight: 600, fontSize: "0.786rem",
            background: view === "list" ? "var(--accent)" : "var(--surface-03)",
            border: "none", color: view === "list" ? "#fff" : "var(--text-secondary)",
            cursor: "pointer" }}>List</button>
          <button onClick={fetchSectors} style={{ display: "flex", alignItems: "center", gap: 5,
            background: "var(--surface-03)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
            padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem" }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))",
        gap: 10, marginBottom: 20 }}>
        {[
          { label: "Sectors",   val: sectors.length,                                             color: "var(--accent-bright)" },
          { label: "Bullish",   val: sectors.filter(s=>s.avg_change_pct>0).length,               color: "var(--color-up)" },
          { label: "Bearish",   val: sectors.filter(s=>s.avg_change_pct<0).length,               color: "var(--color-down)" },
          { label: "Best",      val: sectors[0]?.sector?.slice(0,12) ?? "—",                     color: "var(--color-up)" },
          { label: "Best %",    val: sectors[0] ? `+${sectors[0].avg_change_pct.toFixed(2)}%` : "—", color: "var(--color-up)" },
          { label: "Worst %",   val: sectors.at(-1) ? `${sectors.at(-1)!.avg_change_pct.toFixed(2)}%` : "—", color: "var(--color-down)" },
        ].map(({ label, val, color }) => (
          <div key={label} className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
            <div style={{ fontWeight: 700, color, marginTop: 2, fontSize: "0.9rem" }}>{val}</div>
          </div>
        ))}
      </div>

      {loading && !sectors.length && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
          Loading sector data…
        </div>
      )}

      {view === "heatmap" && sectors.length > 0 && (
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {sectors.map(s => <HeatCard key={s.sector} s={s} />)}
        </div>
      )}

      {view === "list" && sectors.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="kp-table" style={{ margin: 0 }}>
            <thead><tr>
              <th>#</th><th>Sector</th>
              <th style={{ textAlign: "right" }}>Avg Change %</th>
              <th style={{ textAlign: "right" }}>Stocks</th>
              <th style={{ textAlign: "right" }}>Advancing</th>
              <th style={{ textAlign: "right" }}>Declining</th>
              <th>Top Gainer</th>
            </tr></thead>
            <tbody>
              {sectors.map((s, i) => {
                const up = s.avg_change_pct >= 0;
                return (
                  <tr key={s.sector}>
                    <td style={{ color: "var(--text-tertiary)", fontSize: "0.786rem" }}>{i+1}</td>
                    <td style={{ fontWeight: 700 }}>{s.sector}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: up ? "var(--color-up)" : "var(--color-down)" }}>
                      {up ? "+" : ""}{s.avg_change_pct.toFixed(2)}%
                    </td>
                    <td style={{ textAlign: "right", fontSize: "0.857rem" }}>{s.stock_count}</td>
                    <td style={{ textAlign: "right", color: "var(--color-up)", fontWeight: 600 }}>{s.advances}</td>
                    <td style={{ textAlign: "right", color: "var(--color-down)", fontWeight: 600 }}>{s.declines}</td>
                    <td>
                      {s.top_gainer
                        ? <Link href={`/instruments/${s.top_gainer}`}
                            style={{ fontFamily: "var(--font-mono)", color: "var(--color-up)",
                              textDecoration: "none", fontWeight: 700, fontSize: "0.857rem" }}>
                            {s.top_gainer}
                          </Link>
                        : <span style={{ color: "var(--text-tertiary)", fontSize: "0.786rem" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
