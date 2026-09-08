"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Sun, Moon, Bell, TrendingUp, TrendingDown, X } from "lucide-react";
import { SystemStatus } from "@/components/ui/SystemStatus";
import { TickerStrip } from "@/components/ui/TickerStrip";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SearchResult {
  symbol: string;
  name: string;
  close: number;
  change_pct: number;
}

export function Header() {
  const router = useRouter();
  const [theme, setTheme]           = useState<"dark" | "light">("dark");
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focused, setFocused]       = useState(false);
  const [time, setTime]             = useState("");
  const [activeIdx, setActiveIdx]   = useState(-1);
  const searchRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();

  // IST clock
  useEffect(() => {
    const tick = () => setTime(
      new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "2-digit",
        minute: "2-digit", second: "2-digit", hour12: false,
      })
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) { setResults([]); setShowDropdown(false); return; }
    setSearching(true);
    try {
      const r = await fetch(`${API}/api/v1/market/search?q=${encodeURIComponent(q)}&limit=12`);
      if (r.ok) {
        const d: SearchResult[] = await r.json();
        setResults(d);
        setShowDropdown(d.length > 0);
        setActiveIdx(-1);
      }
    } catch { } finally { setSearching(false); }
  }, []);

  const onInput = (v: string) => {
    setQuery(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 200);
  };

  const navigate = (symbol: string) => {
    setShowDropdown(false);
    setQuery("");
    setResults([]);
    router.push(`/instruments/${symbol}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      navigate(results[activeIdx].symbol);
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <header className="header" role="banner">

      {/* ── Global Stock Search ────────────────────────────── */}
      <div ref={searchRef} style={{ position: "relative", flex: "1 1 320px", maxWidth: 520 }}>
        <div
          className="header-search"
          role="search"
          onClick={() => inputRef.current?.focus()}
          style={{
            borderColor: focused ? "var(--accent)" : undefined,
            boxShadow:   focused ? "0 0 0 2px rgba(99,102,241,0.15)" : undefined,
          }}
        >
          <Search size={14} color={focused ? "var(--accent-bright)" : "var(--text-tertiary)"} />
          <input
            id="kp-search"
            ref={inputRef}
            type="text"
            placeholder="Search any NSE stock, company… (Ctrl+K)"
            value={query}
            onChange={e => onInput(e.target.value)}
            onFocus={() => { setFocused(true); if (query) doSearch(query); }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            aria-label="Search stocks"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            autoComplete="off"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); setShowDropdown(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0 }}>
              <X size={12} />
            </button>
          )}
          {!query && <span className="header-kbd">⌘K</span>}
        </div>

        {/* Search dropdown */}
        {showDropdown && results.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            background: "var(--surface-02)", border: "1px solid var(--border)",
            borderRadius: "var(--border-radius)", boxShadow: "var(--shadow-lg)",
            zIndex: 1000, overflow: "hidden",
          }}>
            <div style={{ padding: "6px 12px", fontSize: "0.643rem", color: "var(--text-tertiary)",
              borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
              <span>NSE Stocks · {results.length} matches</span>
              <span>↑↓ navigate · Enter to open</span>
            </div>
            {results.map((r, i) => {
              const up = r.change_pct >= 0;
              return (
                <div key={r.symbol}
                  onMouseDown={() => navigate(r.symbol)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", cursor: "pointer",
                    background: i === activeIdx ? "var(--surface-03)" : "transparent",
                    borderBottom: i < results.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = i === activeIdx ? "var(--surface-03)" : "transparent")}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                      fontSize: "0.857rem", color: "var(--accent-bright)" }}>
                      {r.symbol}
                    </div>
                    <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
                      {r.name}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 90 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem", fontWeight: 600 }}>
                      ₹{r.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700,
                      color: up ? "var(--color-up)" : "var(--color-down)",
                      display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end",
                    }}>
                      {up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {up ? "+" : ""}{r.change_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ padding: "6px 12px", fontSize: "0.643rem", color: "var(--text-tertiary)",
              borderTop: "1px solid var(--border-subtle)", background: "var(--surface-03)" }}>
              {searching ? "Searching…" : `Showing top ${results.length} of 2,077+ NSE stocks`}
            </div>
          </div>
        )}
      </div>

      <div className="header-spacer" />

      {/* Live ticker */}
      <TickerStrip />

      {/* IST Clock */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem",
        color: "var(--text-tertiary)", padding: "0 8px", whiteSpace: "nowrap" }}>
        IST {time}
      </div>

      <SystemStatus compact />

      <button className="header-action" aria-label="Alerts" title="Alerts"
        onClick={() => router.push("/alerts")}>
        <Bell size={15} />
      </button>

      <button className="header-action" onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </header>
  );
}
