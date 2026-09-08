"use client";
/**
 * KP — All Stocks Page
 * Full paginated list of all NSE stocks with real OHLCV data.
 * Search by symbol/name, filter by sector, sort by any column.
 */
import { useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, TrendingUp, TrendingDown, Filter, ArrowUpDown, RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Stock {
  symbol: string; name: string; sector: string | null; industry: string | null;
  close: number; prev_close: number; change: number; change_pct: number;
  volume: number; high: number | null; low: number | null; open: number | null;
}

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}
function fmtVol(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export default function StocksPage() {
  const [stocks,   setStocks]   = useState<Stock[]>([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [page,     setPage]     = useState(1);
  const [size]                  = useState(50);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [sector,   setSector]   = useState("");
  const [sortBy,   setSortBy]   = useState("change_pct");
  const [order,    setOrder]    = useState("desc");
  const [sectors,  setSectors]  = useState<string[]>([]);
  const [tradeDate,setTradeDate]= useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchStocks = useCallback(async (pg = 1, s = search, sec = sector, sb = sortBy, ord = order) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), size: String(size),
        sort_by: sb, order: ord,
      });
      if (s) params.set("search", s);
      if (sec) params.set("sector", sec);
      const r = await fetch(`${API}/api/v1/market/all-stocks?${params}`);
      if (r.ok) {
        const d = await r.json();
        setStocks(d.stocks || []);
        setTotal(d.total || 0);
        setPages(d.pages || 1);
        setPage(pg);
        setTradeDate(d.trade_date || "");
      }
    } finally { setLoading(false); }
  }, [search, sector, sortBy, order, size]);

  // Fetch sectors for dropdown
  useEffect(() => {
    fetch(`${API}/api/v1/market/sector-performance`)
      .then(r => r.json())
      .then(d => setSectors((d as any[]).map(s => s.sector).filter(Boolean)))
      .catch(() => {});
    fetchStocks();
  }, []);

  const onSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchStocks(1, v, sector, sortBy, order), 400);
  };

  const onSectorChange = (v: string) => {
    setSector(v);
    fetchStocks(1, search, v, sortBy, order);
  };

  const onSort = (col: string) => {
    const newOrder = sortBy === col && order === "desc" ? "asc" : "desc";
    setSortBy(col); setOrder(newOrder);
    fetchStocks(1, search, sector, col, newOrder);
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => onSort(col)} style={{ cursor: "pointer", userSelect: "none", textAlign: col !== "symbol" && col !== "name" ? "right" : "left" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        <ArrowUpDown size={10} style={{ opacity: sortBy === col ? 1 : 0.3 }} />
      </span>
    </th>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4 }}>All Stocks</h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            {total.toLocaleString("en-IN")} stocks · {tradeDate ? `Session: ${tradeDate}` : ""} · Source: yfinance OHLCV
          </p>
        </div>
        <button onClick={() => fetchStocks(page)} style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem",
        }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            id="stocks-search"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search symbol or company name…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              borderRadius: "var(--border-radius)", color: "var(--text-primary)",
              padding: "8px 10px 8px 30px", fontSize: "0.857rem",
            }}
          />
        </div>
        <div style={{ position: "relative" }}>
          <Filter size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <select
            id="stocks-sector"
            value={sector}
            onChange={e => onSectorChange(e.target.value)}
            style={{
              paddingLeft: 26, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              background: "var(--surface-03)", border: "1px solid var(--border)",
              borderRadius: "var(--border-radius)", color: "var(--text-primary)",
              fontSize: "0.857rem", cursor: "pointer",
            }}>
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <SortHeader col="symbol" label="Symbol" />
              <th>Name / Sector</th>
              <SortHeader col="close" label="LTP ₹" />
              <SortHeader col="change_pct" label="Change %" />
              <th style={{ textAlign: "right" }}>Open</th>
              <th style={{ textAlign: "right" }}>High</th>
              <th style={{ textAlign: "right" }}>Low</th>
              <SortHeader col="volume" label="Volume" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>
                Loading…
              </td></tr>
            )}
            {!loading && stocks.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>
                No stocks found
              </td></tr>
            )}
            {stocks.map(s => {
              const up = s.change_pct >= 0;
              return (
                <tr key={s.symbol} style={{ transition: "background 0.1s" }}>
                  <td>
                    <Link href={`/instruments/${s.symbol}`} style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", textDecoration: "none",
                    }}>{s.symbol}</Link>
                  </td>
                  <td>
                    <div style={{ fontSize: "0.857rem" }}>{s.name}</div>
                    {s.sector && <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{s.sector}</div>}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>₹{fmt(s.close)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: up ? "var(--color-up)" : "var(--color-down)",
                      display: "inline-flex", alignItems: "center", gap: 2,
                    }}>
                      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {up ? "+" : ""}{fmt(s.change_pct)}%
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem", color: "var(--text-secondary)" }}>₹{fmt(s.open)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem", color: "var(--color-up)" }}>₹{fmt(s.high)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem", color: "var(--color-down)" }}>₹{fmt(s.low)}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem", color: "var(--text-secondary)" }}>{fmtVol(s.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button disabled={page <= 1} onClick={() => fetchStocks(1)}
            style={{ padding: "5px 10px", borderRadius: "var(--border-radius)", cursor: page <= 1 ? "not-allowed" : "pointer",
              background: "var(--surface-03)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: page <= 1 ? 0.4 : 1 }}>«</button>
          <button disabled={page <= 1} onClick={() => fetchStocks(page - 1)}
            style={{ padding: "5px 10px", borderRadius: "var(--border-radius)", cursor: page <= 1 ? "not-allowed" : "pointer",
              background: "var(--surface-03)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: page <= 1 ? 0.4 : 1 }}>‹</button>
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => {
            const p = Math.max(1, page - 4) + i;
            if (p > pages) return null;
            return (
              <button key={p} onClick={() => fetchStocks(p)}
                style={{ padding: "5px 10px", borderRadius: "var(--border-radius)", cursor: "pointer",
                  background: p === page ? "var(--accent)" : "var(--surface-03)",
                  border: "1px solid var(--border)", color: p === page ? "#fff" : "var(--text-secondary)" }}>{p}</button>
            );
          })}
          <button disabled={page >= pages} onClick={() => fetchStocks(page + 1)}
            style={{ padding: "5px 10px", borderRadius: "var(--border-radius)", cursor: page >= pages ? "not-allowed" : "pointer",
              background: "var(--surface-03)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: page >= pages ? 0.4 : 1 }}>›</button>
          <button disabled={page >= pages} onClick={() => fetchStocks(pages)}
            style={{ padding: "5px 10px", borderRadius: "var(--border-radius)", cursor: page >= pages ? "not-allowed" : "pointer",
              background: "var(--surface-03)", border: "1px solid var(--border)", color: "var(--text-secondary)", opacity: page >= pages ? 0.4 : 1 }}>»</button>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: "0.714rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Page {page} of {pages} · {total.toLocaleString("en-IN")} stocks · Data source: yfinance OHLCV · {tradeDate}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
