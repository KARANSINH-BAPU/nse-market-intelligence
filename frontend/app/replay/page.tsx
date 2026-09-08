"use client";
/**
 * KP — Market Replay
 * Step through historical trading days for any NSE stock.
 */
import { useState, useCallback, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Clock, TrendingUp, TrendingDown } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Bar { trade_date: string; open: number; high: number; low: number; close: number; volume: number; }

export default function ReplayPage() {
  const [symbol,   setSymbol]   = useState("RELIANCE");
  const [bars,     setBars]     = useState<Bar[]>([]);
  const [idx,      setIdx]      = useState(0);
  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(800);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setPlaying(false); setBars([]); setIdx(0);
    try {
      const r = await fetch(`${API}/api/v1/ohlcv/${symbol.toUpperCase().trim()}?period=1y`);
      if (!r.ok) { setError(`No data for ${symbol}. Try a valid NSE symbol.`); return; }
      const d = await r.json();
      const b: Bar[] = (d.bars ?? []).map((b: any) => ({
        trade_date: b.trade_date ?? b.date, open: b.open, high: b.high,
        low: b.low, close: b.close, volume: b.volume
      })).filter((b: Bar) => b.trade_date && b.close);
      if (!b.length) { setError("No OHLCV data found"); return; }
      setBars(b);
      setIdx(0);
    } finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => {
    if (!playing || idx >= bars.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setIdx(i => i + 1), speed);
    return () => clearTimeout(t);
  }, [playing, idx, bars.length, speed]);

  const cur  = bars[idx];
  const prev = bars[idx - 1];
  const chg  = cur && prev ? cur.close - prev.close : 0;
  const pct  = cur && prev && prev.close ? (chg / prev.close) * 100 : 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
          display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={20} style={{ color: "#6366f1" }} /> Market Replay
        </h1>
        <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Step through historical NSE data bar by bar — simulated trading practice
        </p>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="NSE Symbol"
            style={{ padding: "7px 12px", background: "var(--surface-03)",
              border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
              color: "var(--text-primary)", fontSize: "0.857rem", fontFamily: "var(--font-mono)",
              width: 140 }} />
          <button onClick={load} disabled={loading}
            style={{ padding: "7px 16px", background: "var(--accent)", border: "none",
              borderRadius: "var(--border-radius)", color: "#fff",
              cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.857rem" }}>
            {loading ? "Loading…" : "Load Data"}
          </button>
          {bars.length > 0 && (
            <>
              <div style={{ height: 24, width: 1, background: "var(--border)" }} />
              <button onClick={() => setIdx(0)} style={btnStyle}><SkipBack size={14}/></button>
              <button onClick={() => setIdx(i => Math.max(0, i-1))} style={btnStyle}>‹</button>
              <button onClick={() => setPlaying(p => !p)} style={{ ...btnStyle,
                background: playing ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)",
                color: playing ? "var(--color-down)" : "var(--color-up)" }}>
                {playing ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
              </button>
              <button onClick={() => setIdx(i => Math.min(bars.length-1, i+1))} style={btnStyle}>›</button>
              <button onClick={() => setIdx(bars.length-1)} style={btnStyle}><SkipForward size={14}/></button>
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                style={{ padding: "6px 8px", background: "var(--surface-03)",
                  border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
                  color: "var(--text-secondary)", fontSize: "0.786rem" }}>
                <option value={200}>Fast (0.2s)</option>
                <option value={500}>Normal (0.5s)</option>
                <option value={800}>Slow (0.8s)</option>
                <option value={1500}>Very Slow (1.5s)</option>
              </select>
              <span style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
                Day {idx+1} / {bars.length}
              </span>
              {/* progress */}
              <div style={{ flex: 1, height: 6, background: "var(--surface-03)",
                borderRadius: 3, minWidth: 80, overflow: "hidden" }}>
                <div style={{ width: `${(idx/(bars.length-1))*100}%`, height: "100%",
                  background: "var(--accent)", transition: "width 0.1s" }} />
              </div>
            </>
          )}
        </div>
        {error && <div style={{ color: "var(--color-down)", fontSize: "0.786rem", marginTop: 8 }}>{error}</div>}
      </div>

      {cur && (
        <>
          {/* Current bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Date",   val: cur.trade_date,
                color: "var(--text-primary)" },
              { label: "Open",   val: `₹${cur.open.toLocaleString("en-IN", {maximumFractionDigits:2})}`,
                color: "var(--text-primary)" },
              { label: "High",   val: `₹${cur.high.toLocaleString("en-IN", {maximumFractionDigits:2})}`,
                color: "var(--color-up)" },
              { label: "Low",    val: `₹${cur.low.toLocaleString("en-IN", {maximumFractionDigits:2})}`,
                color: "var(--color-down)" },
              { label: "Close",  val: `₹${cur.close.toLocaleString("en-IN", {maximumFractionDigits:2})}`,
                color: pct >= 0 ? "var(--color-up)" : "var(--color-down)" },
              { label: "Change", val: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
                color: pct >= 0 ? "var(--color-up)" : "var(--color-down)" },
            ].map(({ label, val, color }) => (
              <div key={label} className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
                <div style={{ fontWeight: 800, color, marginTop: 2,
                  fontSize: label === "Date" ? "0.786rem" : "0.95rem" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Mini chart — visible bars so far */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 12,
              display: "flex", alignItems: "center", gap: 6 }}>
              {pct >= 0 ? <TrendingUp size={15} color="var(--color-up)"/> : <TrendingDown size={15} color="var(--color-down)"/>}
              {symbol} — Price history up to Day {idx+1}
            </div>
            <div style={{ height: 120, display: "flex", alignItems: "flex-end", gap: 1 }}>
              {bars.slice(0, idx+1).slice(-200).map((b, i, arr) => {
                const minC = Math.min(...arr.map(x=>x.close));
                const maxC = Math.max(...arr.map(x=>x.close));
                const ht   = maxC > minC ? ((b.close - minC) / (maxC - minC)) * 100 : 50;
                const isCur = i === arr.length - 1;
                const up    = i > 0 ? b.close >= arr[i-1].close : true;
                return (
                  <div key={i} title={`${b.trade_date}: ₹${b.close.toFixed(2)}`}
                    style={{ flex: 1, height: `${ht}%`, minHeight: 4,
                      background: isCur ? "var(--accent)" : up ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
                      borderRadius: "2px 2px 0 0", transition: "height 0.1s" }} />
                );
              })}
            </div>
          </div>
        </>
      )}

      {!bars.length && !loading && (
        <div className="card" style={{ padding: "60px 20px", textAlign: "center",
          color: "var(--text-tertiary)" }}>
          Enter a symbol and click "Load Data" to begin replay
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: "var(--border-radius)",
  background: "var(--surface-03)", border: "1px solid var(--border)",
  color: "var(--text-secondary)", cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center",
};
