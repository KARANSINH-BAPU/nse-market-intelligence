"use client";

/**
 * KP Portfolio Page
 *
 * Paper trading portfolio — tracks positions entered manually.
 * P&L = (current LTP - avg buy price) × qty
 * All LTP values are live from /api/v1/market/quote/{symbol}
 *
 * Data persisted in localStorage (no backend DB needed yet).
 * No fabricated prices — LTP always fetched from yfinance.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Plus, Trash2,
  RefreshCw, DollarSign, PieChart, Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface Position {
  id:        string;
  symbol:    string;
  qty:       number;
  avgPrice:  number;         // ₹ — user's cost basis
  side:      "BUY" | "SELL";
  addedAt:   string;         // ISO date
}

interface LivePosition extends Position {
  ltp:        number | null;
  pnl:        number | null;
  pnlPct:     number | null;
  currentVal: number | null;
}

const STORAGE_KEY = "kp_portfolio_v1";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function savePositions(ps: Position[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ps));
}

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtCr(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${fmt(n)}`;
}

// ── Add Position Modal ─────────────────────────────────────────────────────
function AddModal({ onAdd, onClose }: {
  onAdd: (p: Omit<Position, "id" | "addedAt">) => void;
  onClose: () => void;
}) {
  const [sym, setSym]   = useState("");
  const [qty, setQty]   = useState("");
  const [price, setPrice] = useState("");
  const [side, setSide] = useState<"BUY"|"SELL">("BUY");
  const [err, setErr]   = useState("");

  const submit = () => {
    const s = sym.trim().toUpperCase();
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!s || !s.match(/^[A-Z0-9&-]+$/)) { setErr("Invalid symbol"); return; }
    if (!q || q <= 0)  { setErr("Qty must be > 0"); return; }
    if (!p || p <= 0)  { setErr("Price must be > 0"); return; }
    onAdd({ symbol: s, qty: q, avgPrice: p, side });
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 380, maxWidth: "95vw" }}
        onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ marginBottom: 20 }}>
          <span className="card-title">Add Position</span>
          <button onClick={onClose} style={{ background: "none", border: "none",
            color: "var(--text-tertiary)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {[
            { label: "Symbol", id: "sym", value: sym, set: setSym, placeholder: "RELIANCE" },
            { label: "Qty", id: "qty", value: qty, set: setQty, placeholder: "100", type: "number" },
            { label: "Avg Buy Price ₹", id: "price", value: price, set: setPrice, placeholder: "2500.00", type: "number" },
          ].map(({ label, id, value, set, placeholder, type }) => (
            <div key={id}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
              <input id={`portfolio-add-${id}`} type={type ?? "text"} value={value} placeholder={placeholder}
                onChange={e => set(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--surface-03)", border: "1px solid var(--border)",
                  borderRadius: "var(--border-radius)", color: "var(--text-primary)",
                  padding: "8px 10px", fontSize: "0.857rem",
                }}
              />
            </div>
          ))}
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>Side</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["BUY","SELL"] as const).map(s => (
                <button key={s} id={`portfolio-side-${s.toLowerCase()}`}
                  onClick={() => setSide(s)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: "var(--border-radius)",
                    border: "1px solid", cursor: "pointer", fontWeight: 600,
                    background: side === s ? (s === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)") : "var(--surface-03)",
                    borderColor: side === s ? (s === "BUY" ? "var(--color-up)" : "var(--color-down)") : "var(--border)",
                    color: side === s ? (s === "BUY" ? "var(--color-up)" : "var(--color-down)") : "var(--text-secondary)",
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {err && <div style={{ color: "var(--color-down)", fontSize: "0.786rem" }}>{err}</div>}
          <button id="portfolio-add-confirm" onClick={submit} style={{
            padding: "10px", borderRadius: "var(--border-radius)",
            background: "var(--accent)", border: "none", color: "#fff",
            fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
            marginTop: 4,
          }}>Add Position</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [positions, setPositions]   = useState<Position[]>([]);
  const [liveData,  setLiveData]    = useState<Record<string, number | null>>({});
  const [loading,   setLoading]     = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Load from localStorage on mount
  useEffect(() => { setPositions(loadPositions()); }, []);

  // Fetch LTP for all unique symbols
  const fetchPrices = useCallback(async (syms: string[]) => {
    if (!syms.length) return;
    setLoading(true);
    const results: Record<string, number | null> = {};
    await Promise.allSettled(syms.map(async sym => {
      try {
        const r = await fetch(`${API}/api/v1/market/quote/${sym}`);
        if (r.ok) {
          const d = await r.json();
          results[sym] = d.ltp ?? null;
        } else {
          results[sym] = null;
        }
      } catch { results[sym] = null; }
    }));
    setLiveData(prev => ({ ...prev, ...results }));
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  const uniqueSyms = useMemo(
    () => [...new Set(positions.map(p => p.symbol))],
    [positions]
  );

  useEffect(() => { fetchPrices(uniqueSyms); }, [fetchPrices, uniqueSyms]);

  const addPosition = (p: Omit<Position, "id" | "addedAt">) => {
    const newPos: Position = {
      ...p,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      addedAt: new Date().toISOString(),
    };
    const updated = [...positions, newPos];
    setPositions(updated);
    savePositions(updated);
    fetchPrices([p.symbol]);
  };

  const removePosition = (id: string) => {
    const updated = positions.filter(p => p.id !== id);
    setPositions(updated);
    savePositions(updated);
  };

  // Enrich with live P&L
  const live: LivePosition[] = positions.map(p => {
    const ltp = liveData[p.symbol] ?? null;
    const sign = p.side === "BUY" ? 1 : -1;
    const pnl = ltp != null ? sign * (ltp - p.avgPrice) * p.qty : null;
    const pnlPct = ltp != null && p.avgPrice > 0 ? sign * ((ltp - p.avgPrice) / p.avgPrice) * 100 : null;
    const currentVal = ltp != null ? ltp * p.qty : null;
    return { ...p, ltp, pnl, pnlPct, currentVal };
  });

  const totalInvested = positions.reduce((s, p) => s + p.avgPrice * p.qty, 0);
  const totalCurrent  = live.reduce((s, p) => s + (p.currentVal ?? p.avgPrice * p.qty), 0);
  const totalPnL      = live.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalPnLPct   = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const upCount       = live.filter(p => p.pnl != null && p.pnl > 0).length;
  const dnCount       = live.filter(p => p.pnl != null && p.pnl < 0).length;

  const overallUp = totalPnL >= 0;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <PieChart size={20} /> Portfolio
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            Paper trading · LTP from yfinance · P&L calculated in real-time
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button id="portfolio-refresh" onClick={() => fetchPrices(uniqueSyms)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              padding: "7px 14px", cursor: "pointer", fontSize: "0.786rem",
            }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
          <button id="portfolio-add-btn" onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--accent)", border: "none",
              color: "#fff", borderRadius: "var(--border-radius)",
              padding: "7px 16px", cursor: "pointer", fontSize: "0.857rem", fontWeight: 600,
            }}>
            <Plus size={13} /> Add Position
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12, marginBottom: 20 }}>
        {[
          { label: "Invested",    value: fmtCr(totalInvested), color: "var(--text-primary)" },
          { label: "Current Value", value: fmtCr(totalCurrent), color: "var(--text-primary)" },
          { label: "Total P&L",
            value: (overallUp ? "+" : "") + fmtCr(totalPnL) + `  (${overallUp ? "+" : ""}${totalPnLPct.toFixed(2)}%)`,
            color: overallUp ? "var(--color-up)" : "var(--color-down)" },
          { label: "Positions",   value: `${live.length}  ↑${upCount}  ↓${dnCount}`, color: "var(--text-primary)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: "1.05rem", color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th style={{ textAlign: "center" }}>Side</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Avg Price</th>
              <th style={{ textAlign: "right" }}>LTP</th>
              <th style={{ textAlign: "right" }}>P&amp;L</th>
              <th style={{ textAlign: "right" }}>P&amp;L %</th>
              <th style={{ textAlign: "right" }}>Curr. Value</th>
              <th style={{ textAlign: "center" }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {live.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "48px 0",
                color: "var(--text-tertiary)", fontSize: "0.857rem" }}>
                No positions yet — click <strong>Add Position</strong> to get started
              </td></tr>
            )}
            {live.map(p => {
              const up = p.pnl != null && p.pnl >= 0;
              const pnlColor = p.pnl != null
                ? (up ? "var(--color-up)" : "var(--color-down)")
                : "var(--text-tertiary)";
              return (
                <tr key={p.id}>
                  <td>
                    <a href={`/instruments/${p.symbol}`} style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", textDecoration: "none",
                    }}>{p.symbol}</a>
                    <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
                      fontFamily: "var(--font-mono)" }}>
                      {new Date(p.addedAt).toLocaleDateString("en-IN")}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 700,
                      background: p.side === "BUY" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                      color: p.side === "BUY" ? "var(--color-up)" : "var(--color-down)",
                    }}>
                      {p.side === "BUY" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {p.side}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {p.qty.toLocaleString("en-IN")}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    ₹{fmt(p.avgPrice)}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)",
                    color: p.ltp != null ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                    {p.ltp != null ? `₹${fmt(p.ltp)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: pnlColor, fontWeight: 600 }}>
                    {p.pnl != null ? `${up ? "+" : ""}₹${fmt(Math.abs(p.pnl))}` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: pnlColor }}>
                    {p.pnlPct != null ? `${up ? "+" : ""}${p.pnlPct.toFixed(2)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {p.currentVal != null ? `₹${fmt(p.currentVal, 0)}` : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button id={`portfolio-remove-${p.symbol}`}
                      onClick={() => removePosition(p.id)}
                      style={{ background: "none", border: "none",
                        color: "var(--color-down)", cursor: "pointer", opacity: 0.7 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lastRefresh && (
          <div style={{ padding: "8px 16px", fontSize: "0.714rem",
            color: "var(--text-tertiary)", borderTop: "1px solid var(--border)" }}>
            LTP refreshed: {lastRefresh.toLocaleTimeString("en-IN")} · source: yfinance · paper trading only
          </div>
        )}
      </div>

      {showModal && <AddModal onAdd={addPosition} onClose={() => setShowModal(false)} />}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
