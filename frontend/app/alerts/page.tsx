"use client";

/**
 * KP — Alerts Page
 *
 * Create and manage price/RSI threshold alerts.
 * Alerts are stored in Redis (backend). Triggered alerts are
 * pushed via WebSocket and shown as notifications.
 *
 * Alert types:
 *   price_above / price_below — LTP threshold (₹)
 *   rsi_above  / rsi_below   — RSI(14) threshold (0-100)
 */

import { useCallback, useEffect, useState } from "react";
import {
  Bell, BellOff, Plus, Trash2, RefreshCw,
  TrendingUp, TrendingDown, Activity,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type AlertType = "price_above" | "price_below" | "rsi_above" | "rsi_below";

interface Alert {
  id:           string;
  symbol:       string;
  type:         AlertType;
  threshold:    number;
  note:         string | null;
  created_at:   string;
  triggered_at: string | null;
  active:       boolean;
}

const TYPE_LABELS: Record<AlertType, string> = {
  price_above: "Price ≥",
  price_below: "Price ≤",
  rsi_above:   "RSI(14) ≥",
  rsi_below:   "RSI(14) ≤",
};

const TYPE_UNITS: Record<AlertType, string> = {
  price_above: "₹", price_below: "₹",
  rsi_above: "",    rsi_below: "",
};

function fmt(n: number, type: AlertType) {
  if (type.startsWith("rsi")) return n.toFixed(1);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// ── Add Alert Modal ─────────────────────────────────────────────────────────
function AddAlertModal({ onAdd, onClose }: {
  onAdd: (a: { symbol: string; type: AlertType; threshold: number; note?: string }) => void;
  onClose: () => void;
}) {
  const [sym,   setSym]   = useState("");
  const [type,  setType]  = useState<AlertType>("price_above");
  const [thresh,setThresh] = useState("");
  const [note,  setNote]  = useState("");
  const [err,   setErr]   = useState("");

  const submit = () => {
    const s = sym.trim().toUpperCase();
    const t = parseFloat(thresh);
    if (!s) { setErr("Enter a symbol"); return; }
    if (!t || t <= 0) { setErr("Threshold must be > 0"); return; }
    if ((type === "rsi_above" || type === "rsi_below") && (t < 0 || t > 100)) {
      setErr("RSI must be 0–100"); return;
    }
    onAdd({ symbol: s, type, threshold: t, note: note.trim() || undefined });
    onClose();
  };

  const isRSI = type.startsWith("rsi");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="card" style={{ width: 400, maxWidth: "95vw" }}
        onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ marginBottom: 20 }}>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Bell size={14} /> New Alert
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none",
            color: "var(--text-tertiary)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>Symbol</div>
            <input id="alert-sym" value={sym} onChange={e => setSym(e.target.value)}
              placeholder="RELIANCE" style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--surface-03)", border: "1px solid var(--border)",
                borderRadius: "var(--border-radius)", color: "var(--text-primary)",
                padding: "8px 10px", fontSize: "0.857rem",
              }} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>Condition</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["price_above","price_below","rsi_above","rsi_below"] as AlertType[]).map(t => (
                <button key={t} id={`alert-type-${t}`} onClick={() => setType(t)}
                  style={{
                    padding: "8px 6px", borderRadius: "var(--border-radius)",
                    border: "1px solid", cursor: "pointer", fontSize: "0.786rem", fontWeight: 600,
                    background: type === t ? "rgba(99,102,241,0.15)" : "var(--surface-03)",
                    borderColor: type === t ? "var(--accent)" : "var(--border)",
                    color: type === t ? "var(--accent-bright)" : "var(--text-secondary)",
                  }}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>
              {isRSI ? "RSI Threshold (0–100)" : "Price Threshold (₹)"}
            </div>
            <input id="alert-threshold" type="number" value={thresh}
              onChange={e => setThresh(e.target.value)}
              placeholder={isRSI ? "70" : "2500"} min={0} max={isRSI ? 100 : undefined}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--surface-03)", border: "1px solid var(--border)",
                borderRadius: "var(--border-radius)", color: "var(--text-primary)",
                padding: "8px 10px", fontSize: "0.857rem",
              }} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 4 }}>Note (optional)</div>
            <input id="alert-note" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Buy signal" maxLength={200} style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--surface-03)", border: "1px solid var(--border)",
                borderRadius: "var(--border-radius)", color: "var(--text-primary)",
                padding: "8px 10px", fontSize: "0.857rem",
              }} />
          </div>
          {err && <div style={{ color: "var(--color-down)", fontSize: "0.786rem" }}>{err}</div>}
          <button id="alert-add-confirm" onClick={submit} style={{
            padding: "10px", borderRadius: "var(--border-radius)",
            background: "var(--accent)", border: "none", color: "#fff",
            fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
          }}>Set Alert</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [alerts,   setAlerts]   = useState<Alert[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [showModal,setShowModal] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/alerts`);
      if (r.ok) setAlerts(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const addAlert = async (body: { symbol: string; type: AlertType; threshold: number; note?: string }) => {
    const r = await fetch(`${API}/api/v1/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) fetchAlerts();
  };

  const deleteAlert = async (id: string) => {
    await fetch(`${API}/api/v1/alerts/${id}`, { method: "DELETE" });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const active    = alerts.filter(a => a.active);
  const triggered = alerts.filter(a => !a.active && a.triggered_at);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={20} /> Alerts
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.857rem" }}>
            Price &amp; RSI threshold alerts · pushed via WebSocket when triggered · stored in Redis
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button id="alerts-refresh" onClick={fetchAlerts}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
              padding: "7px 14px", cursor: "pointer", fontSize: "0.786rem",
            }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
          <button id="alerts-add-btn" onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--accent)", border: "none",
              color: "#fff", borderRadius: "var(--border-radius)",
              padding: "7px 16px", cursor: "pointer", fontSize: "0.857rem", fontWeight: 600,
            }}>
            <Plus size={13} /> New Alert
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Active", count: active.length,    color: "var(--accent-bright)" },
          { label: "Triggered", count: triggered.length, color: "var(--color-up)" },
          { label: "Total",  count: alerts.length,    color: "var(--text-secondary)" },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            background: "var(--surface-02)", border: "1px solid var(--border)",
            borderRadius: "var(--border-radius)", padding: "6px 14px",
            display: "flex", alignItems: "center", gap: 6,
            fontSize: "0.786rem",
          }}>
            <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
            <span style={{ fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Active Alerts */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ marginBottom: 0, paddingBottom: 10,
          borderBottom: "1px solid var(--border)" }}>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Bell size={13} /> Active Alerts
          </span>
        </div>
        <table className="kp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Condition</th>
              <th style={{ textAlign: "right" }}>Threshold</th>
              <th>Note</th>
              <th>Created</th>
              <th style={{ textAlign: "center" }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px 0",
                color: "var(--text-tertiary)", fontSize: "0.857rem" }}>
                No active alerts · click <strong>New Alert</strong> to create one
              </td></tr>
            )}
            {active.map(a => (
              <tr key={a.id}>
                <td>
                  <a href={`/instruments/${a.symbol}`} style={{
                    fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: "var(--accent-bright)", textDecoration: "none",
                  }}>{a.symbol}</a>
                </td>
                <td>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: a.type.includes("above") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    color: a.type.includes("above") ? "var(--color-up)" : "var(--color-down)",
                    padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600,
                  }}>
                    {a.type.includes("above") ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {TYPE_LABELS[a.type]}
                  </span>
                </td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {fmt(a.threshold, a.type)}
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: "0.786rem" }}>
                  {a.note || "—"}
                </td>
                <td style={{ color: "var(--text-tertiary)", fontSize: "0.714rem",
                  fontFamily: "var(--font-mono)" }}>
                  {new Date(a.created_at).toLocaleDateString("en-IN")}
                </td>
                <td style={{ textAlign: "center" }}>
                  <button id={`alert-del-${a.id.slice(0,8)}`}
                    onClick={() => deleteAlert(a.id)}
                    style={{ background: "none", border: "none",
                      color: "var(--color-down)", cursor: "pointer", opacity: 0.7 }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Triggered Alerts */}
      {triggered.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ marginBottom: 0, paddingBottom: 10,
            borderBottom: "1px solid var(--border)" }}>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6,
              color: "var(--color-up)" }}>
              <Activity size={13} /> Triggered
            </span>
          </div>
          <table className="kp-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Condition</th>
                <th style={{ textAlign: "right" }}>Threshold</th>
                <th>Note</th>
                <th>Triggered At</th>
                <th style={{ textAlign: "center" }}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {triggered.map(a => (
                <tr key={a.id} style={{ opacity: 0.75 }}>
                  <td>
                    <a href={`/instruments/${a.symbol}`} style={{
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: "var(--accent-bright)", textDecoration: "none",
                    }}>{a.symbol}</a>
                  </td>
                  <td style={{ color: "var(--text-tertiary)", fontSize: "0.786rem" }}>
                    {TYPE_LABELS[a.type]}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {fmt(a.threshold, a.type)}
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.786rem" }}>
                    {a.note || "—"}
                  </td>
                  <td style={{ color: "var(--color-up)", fontSize: "0.714rem",
                    fontFamily: "var(--font-mono)" }}>
                    {a.triggered_at ? new Date(a.triggered_at).toLocaleString("en-IN") : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => deleteAlert(a.id)}
                      style={{ background: "none", border: "none",
                        color: "var(--color-down)", cursor: "pointer", opacity: 0.5 }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AddAlertModal onAdd={addAlert} onClose={() => setShowModal(false)} />}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
