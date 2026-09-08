"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, InstrumentSummary } from "@/lib/api";
import { Search, TrendingUp, TrendingDown, Filter, RefreshCw } from "lucide-react";

const TYPES = ["", "EQ", "ETF", "INDEX", "FUT", "OPT"];

export default function InstrumentsPage() {
  const [query, setQuery]       = useState("");
  const [typeFilter, setType]   = useState("");
  const [fnoOnly, setFno]       = useState(false);
  const [items, setItems]       = useState<InstrumentSummary[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const debounceRef             = useRef<ReturnType<typeof setTimeout>>();
  const PAGE_SIZE = 25;

  const load = useCallback(async (p = 1, q = query, t = typeFilter) => {
    setLoading(true);
    try {
      const data = await api.instruments({
        q: q || undefined,
        instrument_type: t || undefined,
        page: p,
        page_size: PAGE_SIZE,
      });
      setItems(data.items);
      setTotal(data.total);
      setPage(p);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [query, typeFilter]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, query, typeFilter), 300);
  }, [query, typeFilter, load]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>
          NSE Instruments
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
          {total.toLocaleString()} equities loaded · source: NSE EQUITY_L.CSV
        </p>
      </div>

      {/* Controls bar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 20,
        flexWrap: "wrap", alignItems: "center",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <Search size={14} style={{
            position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: "var(--text-tertiary)",
          }} />
          <input
            id="instruments-search"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search symbol or company name…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--surface-03)",
              border: "1px solid var(--border)",
              borderRadius: "var(--border-radius)",
              color: "var(--text-primary)",
              padding: "8px 12px 8px 32px",
              fontSize: "0.857rem", outline: "none",
            }}
          />
        </div>

        {/* Type filter */}
        <select
          id="type-filter"
          value={typeFilter}
          onChange={e => setType(e.target.value)}
          style={{
            background: "var(--surface-03)",
            border: "1px solid var(--border)",
            borderRadius: "var(--border-radius)",
            color: "var(--text-primary)",
            padding: "8px 12px", fontSize: "0.857rem",
          }}
        >
          {TYPES.map(t => (
            <option key={t} value={t}>{t || "All Types"}</option>
          ))}
        </select>

        {/* F&O toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 6,
          fontSize: "0.857rem", color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            id="fno-toggle"
            type="checkbox"
            checked={fnoOnly}
            onChange={e => setFno(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          F&amp;O Eligible
        </label>

        {/* Refresh */}
        <button
          id="refresh-instruments"
          onClick={() => load(1)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface-04)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
            padding: "8px 14px", cursor: "pointer", fontSize: "0.786rem",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Symbol</th>
              <th>Company</th>
              <th style={{ width: 80 }}>Type</th>
              <th style={{ width: 80 }}>Category</th>
              <th style={{ width: 60, textAlign: "center" }}>F&amp;O</th>
              <th style={{ width: 120 }}>ISIN</th>
              <th style={{ width: 80, textAlign: "center" }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "40px 0",
                  color: "var(--text-tertiary)" }}>
                  {loading ? "Loading…" : "No results"}
                </td>
              </tr>
            )}
            {items
              .filter(i => !fnoOnly || i.fno_eligible)
              .map((r) => (
                <tr key={r.id} style={{ cursor: "default" }}>
                  <td>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)" }}>
                      {r.symbol}
                    </span>
                  </td>
                  <td style={{ maxWidth: 280, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.company_name ?? "—"}
                  </td>
                  <td>
                    <span className="data-source">{r.instrument_type}</span>
                  </td>
                  <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                    {r.market_cap_category ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {r.fno_eligible
                      ? <TrendingUp size={13} color="var(--color-up)" />
                      : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem",
                    color: "var(--text-tertiary)" }}>
                    {r.isin ?? "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ color: r.active ? "var(--color-up)" : "var(--color-down)",
                      fontSize: "0.786rem" }}>
                      {r.active ? "✓" : "✗"}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center",
          justifyContent: "center", marginTop: 20 }}>
          <button
            id="prev-page"
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            style={{
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              padding: "6px 14px", cursor: "pointer", fontSize: "0.857rem",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: "0.857rem", color: "var(--text-secondary)" }}>
            Page {page} of {pages} &nbsp;·&nbsp; {total.toLocaleString()} total
          </span>
          <button
            id="next-page"
            onClick={() => load(page + 1)}
            disabled={page >= pages || loading}
            style={{
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              padding: "6px 14px", cursor: "pointer", fontSize: "0.857rem",
              opacity: page >= pages ? 0.4 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
