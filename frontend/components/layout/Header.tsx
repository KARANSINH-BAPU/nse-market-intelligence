"use client";

import { useState, useEffect } from "react";
import { Search, Sun, Moon, Bell, Command } from "lucide-react";
import { SystemStatus } from "@/components/ui/SystemStatus";

export function Header() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [searchValue, setSearchValue] = useState("");
  const [time, setTime] = useState<string>("");

  // IST time display
  useEffect(() => {
    const update = () => {
      const ist = new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setTime(ist);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <header className="header" role="banner">
      {/* Search */}
      <div
        className="header-search"
        role="search"
        onClick={() => document.getElementById("kp-search")?.focus()}
      >
        <Search size={14} color="var(--text-tertiary)" />
        <input
          id="kp-search"
          type="text"
          placeholder="Search symbol, company, index..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          aria-label="Global search"
        />
        <span className="header-kbd">⌘K</span>
      </div>

      <div className="header-spacer" />

      {/* IST Clock */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.786rem",
        color: "var(--text-tertiary)",
        padding: "0 8px",
      }}>
        IST {time}
      </div>

      {/* System Status mini */}
      <SystemStatus compact />

      {/* Alerts */}
      <button
        className="header-action"
        aria-label="Alerts"
        title="Alerts"
      >
        <Bell size={15} />
      </button>

      {/* Theme toggle */}
      <button
        className="header-action"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        title="Toggle theme"
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Command palette */}
      <button
        className="header-action"
        aria-label="Command palette"
        title="Command palette (⌘K)"
      >
        <Command size={15} />
      </button>
    </header>
  );
}
