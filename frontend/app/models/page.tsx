"use client";
/**
 * KP — Model Lab (Pattern Analysis)
 * Detects candlestick patterns and price patterns from historical OHLCV data.
 */
import { useState, useCallback } from "react";
import { FlaskConical, Search, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Bar { trade_date: string; open: number; high: number; low: number; close: number; volume: number; }
interface Pattern { name: string; type: "bullish"|"bearish"|"neutral"; date: string; description: string; }

function detectPatterns(bars: Bar[]): Pattern[] {
  const patterns: Pattern[] = [];
  if (bars.length < 5) return patterns;

  for (let i = 2; i < bars.length; i++) {
    const b  = bars[i];
    const b1 = bars[i-1];
    const b2 = bars[i-2];
    const body  = Math.abs(b.close - b.open);
    const range = b.high - b.low;
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;

    // Doji
    if (body <= range * 0.1 && range > 0) {
      patterns.push({ name: "Doji", type: "neutral", date: b.trade_date,
        description: "Indecision — body very small. Possible reversal signal." });
    }

    // Hammer (bullish)
    if (lowerWick >= body * 2 && upperWick <= body * 0.5 && b.close > b.open) {
      patterns.push({ name: "Hammer", type: "bullish", date: b.trade_date,
        description: "Long lower wick. Possible bullish reversal at support." });
    }

    // Shooting Star (bearish)
    if (upperWick >= body * 2 && lowerWick <= body * 0.5 && b.close < b.open) {
      patterns.push({ name: "Shooting Star", type: "bearish", date: b.trade_date,
        description: "Long upper wick. Possible bearish reversal at resistance." });
    }

    // Bullish Engulfing
    if (b1.close < b1.open && b.close > b.open &&
        b.close > b1.open && b.open < b1.close) {
      patterns.push({ name: "Bullish Engulfing", type: "bullish", date: b.trade_date,
        description: "Today's green candle engulfs yesterday's red. Strong bullish signal." });
    }

    // Bearish Engulfing
    if (b1.close > b1.open && b.close < b.open &&
        b.open > b1.close && b.close < b1.open) {
      patterns.push({ name: "Bearish Engulfing", type: "bearish", date: b.trade_date,
        description: "Today's red candle engulfs yesterday's green. Strong bearish signal." });
    }

    // Morning Star (3-bar bullish)
    if (b2.close < b2.open && Math.abs(b1.close-b1.open) < (b1.high-b1.low)*0.3
        && b.close > b.open && b.close > (b2.open+b2.close)/2) {
      patterns.push({ name: "Morning Star", type: "bullish", date: b.trade_date,
        description: "3-bar pattern: bearish, doji, bullish. Strong reversal signal." });
    }

    // Three White Soldiers (3 consecutive bullish)
    if (b2.close > b2.open && b1.close > b1.open && b.close > b.open
        && b1.open > b2.open && b.open > b1.open) {
      patterns.push({ name: "Three White Soldiers", type: "bullish", date: b.trade_date,
        description: "Three consecutive bullish candles — strong uptrend momentum." });
    }
  }

  return patterns.slice(-50);
}

export default function ModelLabPage() {
  const [symbol,   setSymbol]   = useState("RELIANCE");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [bars,     setBars]     = useState<Bar[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState<"all"|"bullish"|"bearish">("all");

  const analyse = useCallback(async () => {
    setLoading(true); setError(""); setPatterns([]);
    try {
      const r = await fetch(`${API}/api/v1/ohlcv/${symbol.toUpperCase().trim()}?period=1y`);
      if (!r.ok) { setError(`No data for ${symbol}`); return; }
      const d = await r.json();
      const b: Bar[] = (d.bars ?? []).map((b: any) => ({
        trade_date: b.trade_date ?? b.date, open: b.open, high: b.high,
        low: b.low, close: b.close, volume: b.volume
      })).filter((x: Bar) => x.trade_date && x.close);
      setBars(b);
      setPatterns(detectPatterns(b));
    } finally { setLoading(false); }
  }, [symbol]);

  const shown = patterns.filter(p => filter === "all" || p.type === filter).reverse();
  const bulls = patterns.filter(p => p.type === "bullish").length;
  const bears = patterns.filter(p => p.type === "bearish").length;

  const PAT_COLOR: Record<string,string> = {
    bullish: "var(--color-up)", bearish: "var(--color-down)", neutral: "#f59e0b",
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
          display: "flex", alignItems: "center", gap: 8 }}>
          <FlaskConical size={20} style={{ color: "#6366f1" }} /> Model Lab — Pattern Detection
        </h1>
        <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Candlestick pattern recognition on real 1-year NSE OHLCV data
        </p>
      </div>

      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: "var(--border-radius)", padding: "8px 14px", marginBottom: 16,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Pattern detection is educational. Real trading requires additional confirmation. Not financial advice.
      </div>

      {/* Input */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="NSE symbol e.g. RELIANCE"
            style={{ padding: "8px 14px", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", fontSize: "0.857rem",
              fontFamily: "var(--font-mono)", width: 180 }} />
          <button onClick={analyse} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px",
              background: loading ? "var(--surface-03)" : "var(--accent)",
              border: "none", borderRadius: "var(--border-radius)", color: "#fff",
              cursor: loading ? "not-allowed" : "pointer", fontWeight: 700 }}>
            <Search size={14}/> {loading ? "Analysing…" : "Detect Patterns"}
          </button>
          {patterns.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {(["all","bullish","bearish"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "5px 12px", borderRadius: 20, fontSize: "0.786rem",
                    fontWeight: 600, border: "none", cursor: "pointer",
                    background: filter === f ? (f === "bullish" ? "rgba(34,197,94,0.2)" : f === "bearish" ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.2)") : "var(--surface-03)",
                    color: filter === f ? (f === "bullish" ? "var(--color-up)" : f === "bearish" ? "var(--color-down)" : "var(--accent-bright)") : "var(--text-secondary)" }}>
                  {f === "all" ? `All (${patterns.length})` : f === "bullish" ? `▲ Bullish (${bulls})` : `▼ Bearish (${bears})`}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <div style={{ color: "var(--color-down)", marginTop: 8, fontSize: "0.786rem" }}>{error}</div>}
      </div>

      {bars.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Bars Analysed", val: bars.length, color: "var(--accent-bright)" },
            { label: "Patterns Found", val: patterns.length, color: "var(--text-primary)" },
            { label: "Bullish", val: bulls, color: "var(--color-up)" },
            { label: "Bearish", val: bears, color: "var(--color-down)" },
          ].map(({ label, val, color }) => (
            <div key={label} className="card" style={{ padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
              <div style={{ fontWeight: 800, fontSize: "1.4rem", color, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((p, i) => (
            <div key={i} className="card" style={{ padding: "12px 16px",
              borderColor: `${PAT_COLOR[p.type]}33`,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ padding: "3px 9px", borderRadius: 4, fontSize: "0.75rem",
                  fontWeight: 700, background: `${PAT_COLOR[p.type]}18`,
                  color: PAT_COLOR[p.type] }}>
                  {p.type === "bullish" ? "▲" : p.type === "bearish" ? "▼" : "◈"} {p.name}
                </span>
                <span style={{ fontSize: "0.786rem", color: "var(--text-secondary)" }}>
                  {p.description}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                color: "var(--text-tertiary)", flexShrink: 0, marginLeft: 12 }}>
                {p.date}
              </span>
            </div>
          ))}
        </div>
      )}

      {!patterns.length && !loading && bars.length === 0 && (
        <div className="card" style={{ padding: "60px 20px", textAlign: "center",
          color: "var(--text-tertiary)" }}>
          Enter an NSE symbol and click "Detect Patterns" to analyse candlestick formations
        </div>
      )}
    </div>
  );
}
