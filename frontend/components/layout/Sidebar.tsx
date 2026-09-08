"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, Search, Radar, Brain,
  Building2, Newspaper, BarChart2, Briefcase, TestTube2,
  History, Dna, FlaskConical, BellRing, Bot, Settings,
  ChevronRight, Activity, Shield,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: "default" | "live";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard",      href: "/",          icon: LayoutDashboard },
      { label: "Markets",        href: "/markets",   icon: Activity,     badge: "LIVE", badgeVariant: "live" },
      { label: "Stocks",         href: "/stocks",    icon: TrendingUp },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Screener",       href: "/screener",  icon: Search,  badge: "NEW" },
      { label: "AI Radar",       href: "/radar",     icon: Radar },
      { label: "Market Brain",   href: "/brain",     icon: Brain },
      { label: "Sectors",        href: "/sectors",   icon: Building2 },
    ],
  },
  {
    title: "Data",
    items: [
      { label: "Instruments",    href: "/instruments", icon: BarChart2, badge: "2583" },
      { label: "News",           href: "/news",      icon: Newspaper },
      { label: "F&O",            href: "/fno",       icon: BarChart2 },
    ],
  },
  {
    title: "Research",
    items: [
      { label: "Predictions",    href: "/predictions",  icon: Dna },
      { label: "Backtesting",    href: "/backtest",     icon: TestTube2 },
      { label: "Market Replay",  href: "/replay",       icon: History },
      { label: "Model Lab",      href: "/models",       icon: FlaskConical },
    ],
  },
  {
    title: "Portfolio",
    items: [
      { label: "Portfolio",      href: "/portfolio",    icon: Briefcase },
      { label: "Paper Trading",  href: "/paper",        icon: TestTube2 },
      { label: "Alerts",         href: "/alerts",       icon: BellRing },
    ],
  },
  {
    title: "Tools",
    items: [
      { label: "AI Assistant",   href: "/assistant",    icon: Bot },
      { label: "Settings",       href: "/settings",     icon: Settings },
      { label: "Admin",          href: "/admin",        icon: Shield },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="sidebar" aria-label="KP main navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-mark" aria-hidden>KP</div>
        <div>
          <div className="logo-text">KP</div>
          <div className="logo-version">v0.1.0 · NSE</div>
        </div>
      </div>

      {/* Navigation sections */}
      <div className="sidebar-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="nav-section">
            <div className="nav-section-label">{section.title}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${isActive ? " active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="nav-icon" size={16} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`nav-badge${item.badgeVariant === "live" ? " live" : ""}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer status */}
      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="status-dot unknown" />
          <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
            Market Closed
          </span>
        </div>
      </div>
    </nav>
  );
}
