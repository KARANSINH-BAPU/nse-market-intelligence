"use client";
/**
 * KP — NSE Instruments List
 * Infinite scroll with live price data, search, type filter.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PAGE_SIZE = 50;

interface Instrument {
  id: number; symbol: string; company_name: string|null;
  instrument_type: string; market_cap_category: string|null;
  fno_eligible: boolean; isin: string|null; active: boolean;
  sector: string|null;
}

const TYPES = ["", "EQ", "ETF", "INDEX", "FUT", "OPT"];

export default function InstrumentsPage() {
  const [query,   setQuery]   = useState("");
  const [type,    setType]    = useState("");
  const [items,   setItems]   = useState<Instrument[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef           = useRef<ReturnType<typeof setTimeout>>();
  const loaderRef             = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (pg: number, q: string, t: string, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), page_size: String(PAGE_SIZE),
        ...(q ? { q } : {}),
        ...(t ? { instrument_type: t } : {}),
      });
      const r = await fetch(`${API}/api/v1/instruments?${params}`);
      if (!r.ok) return;
      const d = await r.json();
      const newItems: Instrument[] = d.items ?? [];
      setTotal(d.total ?? 0);
      setItems(prev => reset ? newItems : [...prev, ...newItems]);
      setHasMore(newItems.length === PAGE_SIZE && (reset ? PAGE_SIZE : (pg * PAGE_SIZE)) < (d.total ?? 0));
      setPage(pg);
    } finally { setLoading(false); }
  }, [loading]);

  // Debounce search/filter changes → reset list
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setItems([]); setPage(1); setHasMore(true);
      fetchPage(1, query, type, true);
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type]);

  // Intersection Observer — load next page when loader div visible
  useEffect(() => {
    if (!loaderRef.current) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPage(page + 1, query, type, false);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, page, query, type, fetchPage]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4 }}>NSE Instruments</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.786rem" }}>
          {total.toLocaleString("en-IN")} equities · source: NSE EQUITY_L.CSV · Scroll to load more
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input id="instruments-search" type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search symbol or company name…"
            style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", padding: "8px 12px 8px 32px",
              fontSize: "0.857rem", outline: "none" }} />
        </div>
        <select id="type-filter" value={type} onChange={e => setType(e.target.value)}
          style={{ background: "var(--surface-03)", border: "1px solid var(--border)",
            borderRadius: "var(--border-radius)", color: "var(--text-primary)",
            padding: "8px 12px", fontSize: "0.857rem" }}>
          {TYPES.map(t => <option key={t} value={t}>{t || "All Types"}</option>)}
        </select>
        <button id="refresh-instruments" onClick={() => { setItems([]); setPage(1); setHasMore(true); fetchPage(1, query, type, true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-03)",
            border: "1px solid var(--border)", color: "var(--text-secondary)",
            borderRadius: "var(--border-radius)", padding: "8px 14px",
            cursor: "pointer", fontSize: "0.786rem" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
        <span style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Showing {items.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
        </span>
      </div>

      {/* Table — scrollable */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="kp-table" style={{ margin: 0, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Symbol</th>
                <th>Company Name</th>
                <th style={{ width: 60 }}>Type</th>
                <th style={{ width: 120 }}>Category</th>
                <th style={{ width: 100 }}>Sector</th>
                <th style={{ width: 60, textAlign: "center" }}>F&amp;O</th>
                <th style={{ width: 130 }}>ISIN</th>
                <th style={{ width: 70, textAlign: "center" }}>Chart</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0",
                  color: "var(--text-tertiary)" }}>No results</td></tr>
              )}
              {items.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }}
                  onClick={() => window.location.href = `/instruments/${r.symbol}`}>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", fontSize: "0.857rem" }}>
                      {r.symbol}
                    </span>
                  </td>
                  <td style={{ maxWidth: 280, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "0.857rem" }}>
                    {r.company_name ?? "—"}
                  </td>
                  <td>
                    <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.714rem",
                      fontWeight: 700, background: "rgba(99,102,241,0.1)",
                      color: "var(--accent-bright)" }}>
                      {r.instrument_type}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                    {r.market_cap_category ?? "—"}
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                    {r.sector?.slice(0, 18) ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {r.fno_eligible
                      ? <span style={{ color: "var(--color-up)", fontWeight: 700, fontSize: "0.857rem" }}>✓</span>
                      : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.714rem",
                    color: "var(--text-tertiary)" }}>
                    {r.isin ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }} onClick={e => e.stopPropagation()}>
                    <Link href={`/instruments/${r.symbol}`}
                      style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem",
                        background: "rgba(99,102,241,0.12)", color: "var(--accent-bright)",
                        textDecoration: "none", fontWeight: 600 }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll loader */}
        <div ref={loaderRef} style={{ padding: "16px", textAlign: "center",
          color: "var(--text-tertiary)", fontSize: "0.786rem" }}>
          {loading && (
            <span>
              <RefreshCw size={14} style={{ display: "inline", animation: "spin 1s linear infinite",
                marginRight: 6 }} />
              Loading more instruments…
            </span>
          )}
          {!loading && !hasMore && items.length > 0 && (
            <span>All {total.toLocaleString("en-IN")} instruments loaded ✓</span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .kp-table tbody tr:hover { background: rgba(99,102,241,0.06); }
      `}</style>
    </div>
  );
}
