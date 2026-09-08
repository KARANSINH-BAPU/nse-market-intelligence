"use client";

import { useCallback, useEffect, useState } from "react";
import { api, InstrumentSummary } from "@/lib/api";
import { Search, Filter, TrendingUp, TrendingDown, RefreshCw, Zap } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface ScreenerResult extends InstrumentSummary {
  ltp?: number;
  change?: number;
  change_pct?: number;
}

interface Filter {
  query:    string;
  fnoOnly:  boolean;
  capCat:   string;
  sortBy:   "symbol" | "change_pct" | "ltp";
  sortDir:  "asc" | "desc";
}

const CAP_CATS = ["", "LARGE", "MID", "SMALL", "SME"];

export default function ScreenerPage() {
  const [results, setResults]   = useState<ScreenerResult[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter]     = useState<Filter>({
    query: "", fnoOnly: false, capCat: "", sortBy: "symbol", sortDir: "asc",
  });

  const screen = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.instruments({
        q:               filter.query || undefined,
        instrument_type: "EQ",
        page_size:       50,
      });
      let items = data.items as ScreenerResult[];
      if (filter.fnoOnly) items = items.filter(i => i.fno_eligible);
      if (filter.capCat)  items = items.filter(i => i.market_cap_category === filter.capCat);

      // Sort
      items.sort((a, b) => {
        let va: number | string = a[filter.sortBy] ?? 0;
        let vb: number | string = b[filter.sortBy] ?? 0;
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        return filter.sortDir === "asc"
          ? (va < vb ? -1 : va > vb ? 1 : 0)
          : (va > vb ? -1 : va < vb ? 1 : 0);
      });

      setResults(items);
      setTotal(data.total);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { screen(); }, [screen]);

  const toggleSelect = (sym: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const SortBtn = ({ col, label }: { col: Filter["sortBy"]; label: string }) => (
    <button
      onClick={() => setFilter(f => ({
        ...f,
        sortBy: col,
        sortDir: f.sortBy === col && f.sortDir === "asc" ? "desc" : "asc",
      }))}
      style={{
        background: "none", border: "none", color: filter.sortBy === col
          ? "var(--accent-bright)" : "var(--text-tertiary)",
        cursor: "pointer", fontSize: "0.786rem", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 3,
      }}
    >
      {label} {filter.sortBy === col ? (filter.sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
  );

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>
          Stock Screener
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
          Filter NSE equities by sector, market cap, F&O eligibility · {total.toLocaleString()} stocks
        </p>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%",
              transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              id="screener-search"
              type="text"
              value={filter.query}
              onChange={e => setFilter(f => ({ ...f, query: e.target.value }))}
              placeholder="Symbol or company…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--surface-03)", border: "1px solid var(--border)",
                borderRadius: "var(--border-radius)", color: "var(--text-primary)",
                padding: "7px 10px 7px 28px", fontSize: "0.857rem", outline: "none",
              }}
            />
          </div>

          {/* Cap category */}
          <select
            id="cap-filter"
            value={filter.capCat}
            onChange={e => setFilter(f => ({ ...f, capCat: e.target.value }))}
            style={{
              background: "var(--surface-03)", border: "1px solid var(--border)",
              borderRadius: "var(--border-radius)", color: "var(--text-primary)",
              padding: "7px 10px", fontSize: "0.857rem",
            }}
          >
            {CAP_CATS.map(c => <option key={c} value={c}>{c || "All Cap"}</option>)}
          </select>

          {/* F&O toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 6,
            fontSize: "0.857rem", color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" id="fno-screen" checked={filter.fnoOnly}
              onChange={e => setFilter(f => ({ ...f, fnoOnly: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }} />
            F&amp;O Only
          </label>

          {/* Refresh */}
          <button id="screener-refresh" onClick={screen}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--accent-dim)", border: "1px solid var(--accent)",
              color: "var(--accent-bright)", borderRadius: "var(--border-radius)",
              padding: "7px 14px", cursor: "pointer", fontSize: "0.786rem",
              opacity: loading ? 0.5 : 1,
            }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Screen
          </button>

          {selected.size > 0 && (
            <span style={{ fontSize: "0.857rem", color: "var(--accent-bright)" }}>
              <Zap size={12} style={{ display: "inline", marginRight: 4 }} />
              {selected.size} selected
            </span>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th><SortBtn col="symbol" label="Symbol" /></th>
              <th>Company</th>
              <th style={{ width: 80 }}>Cap</th>
              <th style={{ width: 60, textAlign: "center" }}>F&amp;O</th>
              <th style={{ width: 100, textAlign: "right" }}>
                <SortBtn col="ltp" label="LTP ₹" />
              </th>
              <th style={{ width: 100, textAlign: "right" }}>
                <SortBtn col="change_pct" label="Change" />
              </th>
              <th style={{ width: 90, textAlign: "center" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "36px 0",
                color: "var(--text-tertiary)" }}>
                {loading ? "Screening…" : "No results"}
              </td></tr>
            )}
            {results.map(r => {
              const sel = selected.has(r.symbol);
              const up = r.change_pct != null && r.change_pct >= 0;
              return (
                <tr key={r.id} style={{
                  background: sel ? "var(--accent-dim)" : undefined,
                  cursor: "default",
                }}>
                  <td>
                    <input type="checkbox" checked={sel}
                      onChange={() => toggleSelect(r.symbol)}
                      style={{ accentColor: "var(--accent)" }} />
                  </td>
                  <td>
                    <a href={`/instruments/${r.symbol}`} style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", textDecoration: "none",
                    }}>{r.symbol}</a>
                  </td>
                  <td style={{ maxWidth: 220, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: "var(--text-secondary)", fontSize: "0.857rem" }}>
                    {r.company_name ?? "—"}
                  </td>
                  <td style={{ fontSize: "0.786rem" }}>
                    <span className="data-source">{r.market_cap_category ?? "—"}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {r.fno_eligible
                      ? <TrendingUp size={13} color="var(--color-up)" />
                      : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {r.ltp ? `₹${r.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)",
                    color: r.change_pct != null ? (up ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                    {r.change_pct != null
                      ? `${r.change_pct >= 0 ? "+" : ""}${r.change_pct.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <a href={`/instruments/${r.symbol}`}
                      style={{
                        fontSize: "0.75rem", color: "var(--accent-bright)",
                        textDecoration: "none", background: "var(--surface-04)",
                        border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
                        padding: "3px 8px", display: "inline-block",
                      }}>View</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
