"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, BarChart2, List,
  Radar, Brain, BarChart, Layers, Newspaper, FlaskConical,
  Zap, TestTube2, Clock, Activity, Settings,
  ShieldCheck, Bot, ChevronDown, ChevronRight,
} from "lucide-react";
import { useState } from "react";

const MENU: {
  section?: string;
  items: {
    href: string; label: string; icon: React.ReactNode;
    badge?: string; badgeColor?: string;
  }[];
}[] = [
  {
    section: "OVERVIEW",
    items: [
      { href: "/",        label: "Dashboard",    icon: <LayoutDashboard size={15}/> },
      { href: "/markets", label: "Markets",      icon: <TrendingUp size={15}/>, badge: "LIVE", badgeColor: "#22c55e" },
      { href: "/stocks",  label: "Stocks",       icon: <List size={15}/>,       badge: "2K+", badgeColor: "#6366f1" },
    ],
  },
  {
    section: "INTELLIGENCE",
    items: [
      { href: "/screener",   label: "Screener",       icon: <Activity size={15}/> },
      { href: "/radar",      label: "AI Radar",        icon: <Radar size={15}/>,    badge: "NEW", badgeColor: "#6366f1" },
      { href: "/brain",      label: "Market Brain",    icon: <Brain size={15}/>,    badge: "NEW", badgeColor: "#6366f1" },
      { href: "/sectors",    label: "Sectors",         icon: <Layers size={15}/>,   badge: "NEW", badgeColor: "#6366f1" },
      { href: "/assistant",  label: "AI Assistant",    icon: <Bot size={15}/>,      badge: "AI",  badgeColor: "#8b5cf6" },
    ],
  },
  {
    section: "DATA",
    items: [
      { href: "/instruments", label: "Instruments",  icon: <BarChart size={15}/>,  badge: "2.1K", badgeColor: "#6366f1" },
      { href: "/news",        label: "News",          icon: <Newspaper size={15}/>, badge: "NEW",  badgeColor: "#6366f1" },
      { href: "/fno",         label: "F&O",           icon: <FlaskConical size={15}/>, badge: "NEW", badgeColor: "#f59e0b" },
    ],
  },
  {
    section: "RESEARCH",
    items: [
      { href: "/predictions", label: "Predictions",    icon: <Zap size={15}/>,       badge: "NEW", badgeColor: "#6366f1" },
      { href: "/backtest",    label: "Backtesting",    icon: <TestTube2 size={15}/>,  badge: "NEW", badgeColor: "#10b981" },
      { href: "/replay",      label: "Market Replay",  icon: <Clock size={15}/>,      badge: "NEW", badgeColor: "#10b981" },
      { href: "/models",      label: "Model Lab",      icon: <FlaskConical size={15}/>, badge: "NEW", badgeColor: "#10b981" },
    ],
  },
  {
    section: "ADMIN",
    items: [
      { href: "/alerts",   label: "Alerts",   icon: <Activity size={15}/> },
      { href: "/admin",    label: "Admin",    icon: <ShieldCheck size={15}/>, badge: "SYS", badgeColor: "#64748b" },
      { href: "/settings", label: "Settings", icon: <Settings size={15}/> },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function toggleSection(s: string) {
    setCollapsed(prev => ({ ...prev, [s]: !prev[s] }));
  }

  return (
    <nav style={{
      width: 200, minWidth: 200, height: "100vh",
      background: "var(--surface-01)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflowY: "auto", overflowX: "hidden",
      position: "sticky", top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: "0.857rem", color: "#fff" }}>KP</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.02em" }}>KP</div>
            <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginTop: -2 }}>v1.1.0 · NSE</div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div style={{ flex: 1, padding: "8px 0" }}>
        {MENU.map(group => {
          const isCol = collapsed[group.section ?? ""] ?? false;
          return (
            <div key={group.section} style={{ marginBottom: 4 }}>
              {group.section && (
                <button onClick={() => toggleSection(group.section!)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "4px 14px", border: "none", background: "none",
                    cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.643rem",
                    fontWeight: 700, letterSpacing: "0.08em", marginTop: 6 }}>
                  {group.section}
                  {isCol ? <ChevronRight size={11}/> : <ChevronDown size={11}/>}
                </button>
              )}
              {!isCol && group.items.map(({ href, label, icon, badge, badgeColor }) => {
                const active = isActive(href);
                return (
                  <Link key={href} href={href}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between",
                      padding: "7px 14px", marginInline: 6, borderRadius: "var(--border-radius)",
                      textDecoration: "none",
                      background: active ? "rgba(99,102,241,0.12)" : "transparent",
                      color: active ? "var(--accent-bright)" : "var(--text-secondary)",
                      fontWeight: active ? 700 : 500,
                      fontSize: "0.8rem",
                      transition: "background 0.15s, color 0.15s",
                    }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ opacity: active ? 1 : 0.7, color: active ? "var(--accent-bright)" : "inherit" }}>
                        {icon}
                      </span>
                      {label}
                    </span>
                    {badge && (
                      <span style={{
                        padding: "1px 5px", borderRadius: 4, fontSize: "0.586rem",
                        fontWeight: 700, letterSpacing: "0.04em",
                        background: `${badgeColor}22`, color: badgeColor,
                        border: `1px solid ${badgeColor}44`, flexShrink: 0,
                      }}>{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)",
        fontSize: "0.643rem", color: "var(--text-tertiary)" }}>
        <div style={{ marginBottom: 3 }}>NSE Market Intelligence</div>
        <div>© 2026 KP Platform</div>
      </div>
    </nav>
  );
}
