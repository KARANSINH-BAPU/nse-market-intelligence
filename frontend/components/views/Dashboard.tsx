"use client";

import { useEffect, useState } from "react";
import { SystemStatus } from "@/components/ui/SystemStatus";
import {
  TrendingUp, TrendingDown, Activity, Zap,
  BarChart2, Brain, Radar, AlertTriangle,
} from "lucide-react";

// ── Market Ticker Strip ───────────────────────────────────
const INDICES = [
  { label: "NIFTY 50",      key: "nifty50" },
  { label: "BANK NIFTY",    key: "banknifty" },
  { label: "NIFTY IT",      key: "niftyit" },
  { label: "SENSEX",        key: "sensex" },
  { label: "INDIA VIX",     key: "vix" },
];

function TickerStrip() {
  // Real values would come from WebSocket/API
  // Showing UNAVAILABLE until backend + live feed are configured
  return (
    <div className="ticker-strip" aria-label="Market indices">
      {INDICES.map((idx) => (
        <div key={idx.key} className="ticker-item">
          <span className="ticker-label">{idx.label}</span>
          <span className="ticker-value" style={{ color: "var(--text-tertiary)" }}>
            —
          </span>
          <span className="ticker-change flat">
            <span className="data-source unavail">UNAVAIL</span>
          </span>
        </div>
      ))}
      <div className="ticker-item" style={{ marginLeft: "auto" }}>
        <span className="data-source stale">MARKET CLOSED</span>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  subVariant?: "up" | "down" | "warn" | "flat";
  icon?: React.ElementType;
  unavailable?: boolean;
}

function StatCard({ label, value, sub, subVariant = "flat", icon: Icon, unavailable }: StatCardProps) {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="card-title">{label}</span>
        {Icon && <Icon size={16} color="var(--text-tertiary)" />}
      </div>
      {unavailable ? (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.214rem", color: "var(--text-tertiary)" }}>—</div>
          <div style={{ marginTop: 4 }}>
            <span className="data-source unavail">UNAVAILABLE</span>
          </div>
          <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 6 }}>
            Configure data provider in .env
          </div>
        </div>
      ) : (
        <div>
          <div className="stat-value">{value}</div>
          {sub && <div className={`stat-sub ${subVariant}`} style={{ marginTop: 4 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────
function SectionHeader({ title, icon: Icon }: { title: string; icon?: React.ElementType }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {Icon && <Icon size={15} color="var(--accent-bright)" />}
      <h2 style={{ fontSize: "0.928rem", fontWeight: 600 }}>{title}</h2>
    </div>
  );
}

// ── Phase Banner ──────────────────────────────────────────
function PhaseBanner() {
  return (
    <div style={{
      background: "var(--accent-dim)",
      border: "1px solid var(--accent)",
      borderRadius: "var(--border-radius-lg)",
      padding: "14px 20px",
      marginBottom: 20,
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
    }}>
      <Zap size={18} color="var(--accent-bright)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          KP Platform — Phase 1 Foundation
        </div>
        <div style={{ fontSize: "0.786rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Infrastructure is active. Live market data requires configuring a data provider in{" "}
          <code style={{ background: "var(--surface-04)", padding: "1px 5px", borderRadius: 3 }}>
            .env
          </code>
          . Run{" "}
          <code style={{ background: "var(--surface-04)", padding: "1px 5px", borderRadius: 3 }}>
            python scripts/kp.py doctor
          </code>
          {" "}to check all systems.
        </div>
      </div>
    </div>
  );
}

// ── KP Brain Placeholder ──────────────────────────────────
function MarketBrainPanel() {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Brain size={13} />
          KP Market Brain
        </span>
        <span className="data-source unavail">OFFLINE</span>
      </div>
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <Brain size={32} color="var(--text-tertiary)" style={{ margin: "0 auto 12px" }} />
        <div style={{ color: "var(--text-secondary)", fontSize: "0.857rem", marginBottom: 6 }}>
          Market Brain activates when live data feed is connected
        </div>
        <div style={{ color: "var(--text-tertiary)", fontSize: "0.786rem" }}>
          Configure DATA_PROVIDER in .env → restart → data flows in automatically
        </div>
      </div>
    </div>
  );
}

// ── Signal Stats Placeholder ──────────────────────────────
function AISignalPanel() {
  const items = [
    { label: "BUY Signals", count: "—", variant: "up" },
    { label: "SELL Signals", count: "—", variant: "down" },
    { label: "HOLD Signals", count: "—", variant: "flat" },
    { label: "WAIT / No Trade", count: "—", variant: "warn" },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Radar size={13} />
          Live AI Signals
        </span>
        <span className="data-source unavail">NO DATA</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 4 }}>
        {items.map((item) => (
          <div key={item.label} style={{ padding: "10px", background: "var(--surface-03)", borderRadius: "var(--border-radius)" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{item.label}</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "1.428rem",
              fontWeight: 600,
              color: item.variant === "up"
                ? "var(--color-up)"
                : item.variant === "down"
                ? "var(--color-down)"
                : item.variant === "warn"
                ? "var(--color-warn)"
                : "var(--text-tertiary)",
            }}>
              {item.count}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: "0.714rem", color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={12} />
        ML models initialize in Phase 10. Signals shown here will be real model outputs only.
      </div>
    </div>
  );
}

// ── Gainers / Losers Placeholder ──────────────────────────
function GainersLosersPanel({ type }: { type: "gainers" | "losers" }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {type === "gainers" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          Top {type === "gainers" ? "Gainers" : "Losers"}
        </span>
        <span className="data-source unavail">NO DATA</span>
      </div>
      <table className="kp-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="mono">Price</th>
            <th className="mono">Change</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i}>
              <td>
                <div className="skeleton skeleton-text" style={{ width: 60 }} />
              </td>
              <td className="mono">
                <div className="skeleton skeleton-text" style={{ width: 70 }} />
              </td>
              <td>
                <div className="skeleton skeleton-text" style={{ width: 50 }} />
              </td>
              <td>
                <div className="skeleton skeleton-text" style={{ width: 40 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: "0.714rem", color: "var(--text-tertiary)", fontStyle: "italic" }}>
        Live data required — configure DATA_PROVIDER in .env
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
export function Dashboard() {
  return (
    <>
      {/* Market indices ticker */}
      <TickerStrip />

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Phase notice */}
        <PhaseBanner />

        {/* Top stats row */}
        <div style={{ marginBottom: 20 }}>
          <SectionHeader title="Market Overview" icon={Activity} />
          <div className="dashboard-grid">
            <StatCard label="NIFTY 50" value="—" icon={TrendingUp} unavailable />
            <StatCard label="BANK NIFTY" value="—" icon={BarChart2} unavailable />
            <StatCard label="INDIA VIX" value="—" icon={Activity} unavailable />
            <StatCard label="NSE Advances" value="—" unavailable />
            <StatCard label="NSE Declines" value="—" unavailable />
            <StatCard label="Market Breadth" value="—" unavailable />
          </div>
        </div>

        {/* Main panels grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Left */}
          <div>
            <MarketBrainPanel />
            <GainersLosersPanel type="gainers" />
          </div>
          {/* Right */}
          <div>
            <AISignalPanel />
            <div style={{ marginTop: 16 }}>
              <GainersLosersPanel type="losers" />
            </div>
          </div>
        </div>

        {/* System Status full panel */}
        <div>
          <SectionHeader title="System Status" icon={Activity} />
          <SystemStatus compact={false} />
        </div>
      </div>
    </>
  );
}
