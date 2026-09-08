"use client";
/**
 * KP — Settings Page
 */
import { useState } from "react";
import { Settings, Bell, Palette, Database, Shield, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SettingsPage() {
  const [saved,    setSaved]    = useState(false);
  const [apiPoll,  setApiPoll]  = useState(15);
  const [theme,    setTheme]    = useState("dark");
  const [notifs,   setNotifs]   = useState(true);
  const [wsAuto,   setWsAuto]   = useState(true);
  const [currency, setCurrency] = useState("INR");

  const save = () => {
    localStorage.setItem("kp_settings", JSON.stringify({ apiPoll, theme, notifs, wsAuto, currency }));
    if (theme !== document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", theme);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 0", borderBottom: "1px solid var(--border-subtle)" }}>
        <div>
          <div style={{ fontSize: "0.857rem", fontWeight: 600 }}>{label}</div>
          {sub && <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
        </div>
        {children}
      </div>
    );
  }

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, borderRadius: 12, border: "none",
          background: value ? "var(--accent)" : "var(--surface-03)",
          cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
        <span style={{ position: "absolute", top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
      </button>
    );
  }

  const sections = [
    {
      icon: <Palette size={16} />, title: "Appearance",
      rows: [
        { label: "Theme", sub: "Visual theme for the platform",
          el: <select value={theme} onChange={e => setTheme(e.target.value)}
            style={{ padding: "6px 10px", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", fontSize: "0.786rem" }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select> },
        { label: "Currency Display", sub: "Primary currency symbol",
          el: <select value={currency} onChange={e => setCurrency(e.target.value)}
            style={{ padding: "6px 10px", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", fontSize: "0.786rem" }}>
            <option value="INR">₹ INR</option>
            <option value="USD">$ USD</option>
          </select> },
      ],
    },
    {
      icon: <Bell size={16} />, title: "Notifications",
      rows: [
        { label: "Alert Notifications",
          sub: "Push notifications for price/RSI alerts",
          el: <Toggle value={notifs} onChange={setNotifs} /> },
        { label: "Auto WebSocket Connect",
          sub: "Auto-connect to live market stream on load",
          el: <Toggle value={wsAuto} onChange={setWsAuto} /> },
      ],
    },
    {
      icon: <Database size={16} />, title: "Data & API",
      rows: [
        { label: "REST Poll Interval",
          sub: "How often to refresh market data (seconds)",
          el: <select value={apiPoll} onChange={e => setApiPoll(Number(e.target.value))}
            style={{ padding: "6px 10px", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", fontSize: "0.786rem" }}>
            <option value={5}>5 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
          </select> },
        { label: "Backend API URL",
          sub: "Connected to",
          el: <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem",
            color: "var(--color-up)", padding: "4px 8px", background: "rgba(34,197,94,0.1)",
            borderRadius: 4 }}>{API}</span> },
      ],
    },
    {
      icon: <Shield size={16} />, title: "Privacy & Data",
      rows: [
        { label: "Data Source", sub: "All data from yfinance (open source) — no paid APIs", el: <span style={{ fontSize: "0.786rem", color: "var(--color-up)" }}>✅ Free</span> },
        { label: "Paper Trading", sub: "All trades are simulated — no real money", el: <span style={{ fontSize: "0.786rem", color: "#f59e0b" }}>⚠️ Simulated</span> },
        { label: "Version", sub: "KP NSE Market Intelligence Platform", el: <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem", color: "var(--text-tertiary)" }}>v1.0.0</span> },
      ],
    },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Settings size={20} /> Settings
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Platform preferences and configuration
          </p>
        </div>
        <button onClick={save}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px",
            background: saved ? "rgba(34,197,94,0.2)" : "var(--accent)",
            border: saved ? "1px solid var(--color-up)" : "none",
            borderRadius: "var(--border-radius)", color: saved ? "var(--color-up)" : "#fff",
            cursor: "pointer", fontWeight: 700, fontSize: "0.857rem",
            transition: "all 0.2s" }}>
          {saved ? <><Check size={14}/> Saved!</> : "Save Settings"}
        </button>
      </div>

      {sections.map(sec => (
        <div key={sec.title} className="card" style={{ padding: "18px 22px", marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 7, color: "var(--accent-bright)" }}>
            {sec.icon} {sec.title}
          </h3>
          {sec.rows.map(({ label, sub, el }) => (
            <Row key={label} label={label} sub={sub}>{el}</Row>
          ))}
        </div>
      ))}
    </div>
  );
}
