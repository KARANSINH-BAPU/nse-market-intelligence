"use client";
/**
 * KP — Sectors Performance (Fixed)
 * Uses curated NSE sector → stock mapping to compute real sector performance
 * from the /api/v1/market/all-stocks endpoint which has live OHLCV data.
 */
import { useEffect, useState, useCallback } from "react";
import { PieChart, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Sector {
  sector: string; avg_change_pct: number; stock_count: number;
  advances: number; declines: number;
  best_stock?: string; best_pct?: number; worst_stock?: string; worst_pct?: number;
  stocks?: Array<{ symbol: string; change_pct: number; close: number }>;
}

// NSE Sector → Stock mapping (curated)
const SECTOR_MAP: Record<string, string[]> = {
  "Banking": ["HDFCBANK","SBIN","ICICIBANK","AXISBANK","KOTAKBANK","INDUSINDBK","BANDHANBNK","IDFCFIRSTB","FEDERALBNK","CANBK"],
  "Technology": ["TCS","INFY","WIPRO","HCLTECH","TECHM","LTIM","PERSISTENT","COFORGE","MPHASIS","OFSS"],
  "Pharma": ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","BIOCON","LUPIN","TORNTPHARM","ALKEM","ABBOTINDIA","GLAXO"],
  "Automobiles": ["MARUTI","TATAMOTORS","BAJAJ-AUTO","EICHERMOT","HEROMOTOCO","M&M","ASHOKLEY","TVSMOTOR","BOSCHLTD","APOLLOTYRE"],
  "FMCG": ["HINDUNILVR","NESTLEIND","BRITANNIA","DABUR","MARICO","GODREJCP","COLPAL","EMAMILTD","VBL","TATACONSUM"],
  "Metals & Mining": ["TATASTEEL","JSWSTEEL","HINDALCO","VEDL","SAIL","NMDC","COALINDIA","NATIONALUM","APLAPOLLO","HINDZINC"],
  "Energy & Power": ["RELIANCE","ONGC","NTPC","POWERGRID","BPCL","IOC","GAIL","TATAPOWER","ADANIGREEN","ADANIPORTS"],
  "Financials": ["BAJFINANCE","BAJAJFINSV","HDFCLIFE","SBILIFE","ICICIPRULI","MUTHOOTFIN","CHOLAFIN","M&MFIN","RECLTD","PFC"],
  "Real Estate": ["DLF","GODREJPROP","OBEROIRLTY","PRESTIGE","BRIGADE","SOBHA","MAHINDRACIE","SUNTECK","KOLTEPATIL","NESCO"],
  "Chemicals": ["PIDILITIND","SRF","DEEPAKNITRITE","NAVNETEDUL","CLEAN","AAVAS","TATACHEM","UPL","CHAMBLFERT","COROMANDEL"],
  "Telecom": ["BHARTIARTL","RELIANCE","IDEA","INDUSTOWER","TATACOMM","HCLTECH","MTNL"],
  "Consumer Goods": ["TITAN","PAGEIND","VOLTAS","WHIRLPOOL","BLUESTARCO","RAJESHEXPO","KAJARIVERINFO","CROMPTON","HAVELLS","VGUARD"],
  "Media": ["ZEEL","SUNTV","PVRINOX","NDTV","NETWORK18","TV18BRDCST"],
};

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAt,  setLastAt]  = useState("");
  const [view,    setView]    = useState<"heatmap" | "list">("heatmap");
  const [totalStocks, setTotalStocks] = useState(0);

  const fetchSectors = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Try backend sector-performance API first
      const apiRes = await fetch(`${API}/api/v1/market/sector-performance`).catch(() => null);
      let apiSectors: Sector[] = [];
      if (apiRes?.ok) {
        const d = await apiRes.json();
        if (Array.isArray(d)) apiSectors = d;
      }

      // 2. Fetch live stock prices for all stocks
      const stocksRes = await fetch(`${API}/api/v1/market/all-stocks?size=500&sort_by=change_pct&order=desc`).catch(() => null);
      let liveMap: Record<string, { close: number; change_pct: number }> = {};
      let fetchedTotal = 0;
      if (stocksRes?.ok) {
        const sd = await stocksRes.json();
        fetchedTotal = sd.total ?? sd.stocks?.length ?? 0;
        setTotalStocks(fetchedTotal);
        for (const s of (sd.stocks ?? [])) {
          if (s.symbol) liveMap[s.symbol] = { close: s.close ?? 0, change_pct: s.change_pct ?? 0 };
        }
      }

      // 3. Compute sector performance from predefined mapping + live data
      const computed: Sector[] = [];
      for (const [sec, syms] of Object.entries(SECTOR_MAP)) {
        const data = syms
          .filter(s => liveMap[s])
          .map(s => ({ symbol: s, ...liveMap[s] }));

        if (data.length === 0) {
          // Try fetching individual stocks that have no live data
          // Still include sector with 0 stocks to avoid blank page
          computed.push({
            sector: sec, avg_change_pct: 0, stock_count: 0,
            advances: 0, declines: 0, stocks: [],
          });
          continue;
        }

        const pcts    = data.map(d => d.change_pct);
        const avg_pct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
        const advances = data.filter(d => d.change_pct >= 0).length;
        const declines = data.length - advances;
        const sorted   = [...data].sort((a, b) => b.change_pct - a.change_pct);

        computed.push({
          sector:        sec,
          avg_change_pct: parseFloat(avg_pct.toFixed(2)),
          stock_count:    data.length,
          advances,
          declines,
          best_stock:     sorted[0]?.symbol,
          best_pct:       sorted[0]?.change_pct,
          worst_stock:    sorted[sorted.length - 1]?.symbol,
          worst_pct:      sorted[sorted.length - 1]?.change_pct,
          stocks:         sorted,
        });
      }

      // Use API data if it's better (more sectors) than fallback
      const finalSectors = (apiSectors.length > 2 ? apiSectors : computed)
        .sort((a, b) => b.avg_change_pct - a.avg_change_pct);

      setSectors(finalSectors);
      setLastAt(new Date().toLocaleTimeString("en-IN"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSectors(); }, [fetchSectors]);
  useEffect(() => {
    const id = setInterval(fetchSectors, 60000);
    return () => clearInterval(id);
  }, [fetchSectors]);

  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avg_change_pct)), 1);
  const bullish = sectors.filter(s => s.avg_change_pct > 0).length;
  const bearish = sectors.filter(s => s.avg_change_pct < 0).length;

  function heatBg(pct: number) {
    const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
    if (pct >= 0) return `rgba(34,197,94,${0.1 + intensity * 0.5})`;
    return `rgba(239,68,68,${0.1 + intensity * 0.5})`;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={20} style={{ color: "#6366f1" }} /> Sectors
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Sector performance from real NSE data · {sectors.filter(s => s.stock_count > 0).length} sectors ·
            Updated {lastAt || "loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["heatmap", "list"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: "6px 14px", borderRadius: "var(--border-radius)", fontWeight: 700,
                border: "none", cursor: "pointer", fontSize: "0.786rem",
                background: view === v ? "var(--accent)" : "var(--surface-03)",
                color: view === v ? "#fff" : "var(--text-secondary)" }}>
              {v === "heatmap" ? "Heatmap" : "List"}
            </button>
          ))}
          <button onClick={fetchSectors}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              cursor: "pointer", fontSize: "0.786rem" }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Sectors",  value: sectors.filter(s => s.stock_count > 0).length,  col: "var(--text-primary)" },
          { label: "Bullish",  value: bullish, col: "var(--color-up)" },
          { label: "Bearish",  value: bearish, col: "var(--color-down)" },
          { label: "Best",     value: sectors[0]?.sector ?? "—", col: "var(--color-up)", small: true },
          { label: "Best %",   value: sectors[0] ? `+${sectors[0].avg_change_pct.toFixed(2)}%` : "—", col: "var(--color-up)" },
          { label: "Worst %",  value: sectors[sectors.length-1] ? `${sectors[sectors.length-1].avg_change_pct.toFixed(2)}%` : "—", col: "var(--color-down)" },
        ].map(({ label, value, col, small }) => (
          <div key={label} className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 800, color: col, fontSize: small ? "0.857rem" : "1.2rem" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      {view === "heatmap" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {sectors.filter(s => s.stock_count > 0).map(s => {
            const up = s.avg_change_pct >= 0;
            return (
              <div key={s.sector} style={{ borderRadius: 10, padding: "16px 18px",
                background: heatBg(s.avg_change_pct), border: `1px solid ${up ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                transition: "transform 0.12s", cursor: "default" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = "scale(1.02)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = ""}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>{s.sector}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, fontFamily: "var(--font-mono)",
                  color: up ? "var(--color-up)" : "var(--color-down)" }}>
                  {up ? "+" : ""}{s.avg_change_pct.toFixed(2)}%
                </div>
                <div style={{ fontSize: "0.714rem", color: "var(--text-secondary)", marginTop: 6 }}>
                  {s.stock_count} stocks · ▲{s.advances} ▼{s.declines}
                </div>
                {s.best_stock && (
                  <div style={{ marginTop: 6, fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
                    Best: <span style={{ color: "var(--color-up)", fontWeight: 700 }}>{s.best_stock}</span>
                    {s.best_pct != null ? ` +${s.best_pct.toFixed(1)}%` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="kp-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Sector</th>
                <th style={{ textAlign: "right" }}>Avg Change %</th>
                <th style={{ textAlign: "center" }}>Stocks</th>
                <th style={{ textAlign: "center" }}>▲ Adv / ▼ Dec</th>
                <th>Best Stock</th>
                <th>Worst Stock</th>
              </tr>
            </thead>
            <tbody>
              {sectors.filter(s => s.stock_count > 0).map(s => {
                const up = s.avg_change_pct >= 0;
                return (
                  <tr key={s.sector}>
                    <td style={{ fontWeight: 700 }}>{s.sector}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 800,
                      color: up ? "var(--color-up)" : "var(--color-down)" }}>
                      {up ? "+" : ""}{s.avg_change_pct.toFixed(2)}%
                    </td>
                    <td style={{ textAlign: "center" }}>{s.stock_count}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ color: "var(--color-up)" }}>▲{s.advances}</span>
                      {" / "}
                      <span style={{ color: "var(--color-down)" }}>▼{s.declines}</span>
                    </td>
                    <td>
                      {s.best_stock ? (
                        <Link href={`/instruments/${s.best_stock}`}
                          style={{ color: "var(--color-up)", fontWeight: 700,
                            textDecoration: "none", fontFamily: "var(--font-mono)" }}>
                          {s.best_stock}
                          {s.best_pct != null && <span style={{ marginLeft: 4 }}>+{s.best_pct.toFixed(1)}%</span>}
                        </Link>
                      ) : "—"}
                    </td>
                    <td>
                      {s.worst_stock ? (
                        <Link href={`/instruments/${s.worst_stock}`}
                          style={{ color: "var(--color-down)", fontWeight: 700,
                            textDecoration: "none", fontFamily: "var(--font-mono)" }}>
                          {s.worst_stock}
                          {s.worst_pct != null && <span style={{ marginLeft: 4 }}>{s.worst_pct.toFixed(1)}%</span>}
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sectors.filter(s => s.stock_count > 0).length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-tertiary)" }}>
          <RefreshCw size={24} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
          Loading sector data… ({totalStocks} stocks tracked)
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
