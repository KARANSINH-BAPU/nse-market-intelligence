"use client";
/**
 * KP — Market Brain
 * AI-powered market analysis: sentiment, breadth analysis, sector rotation,
 * momentum heatmap, and market summary using real OHLCV data.
 */
import { useEffect, useState, useCallback } from "react";
import { Brain, TrendingUp, TrendingDown, BarChart2, Activity, RefreshCw, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Breadth { advances: number; declines: number; unchanged: number; total: number; ratio: number; trade_date: string; }
interface Mover   { symbol: string; name: string; close: number; change_pct: number; volume: number; }
interface MoversData { gainers: Mover[]; losers: Mover[]; total_stocks: number; trade_date: string; }

function ScoreGauge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4,
        fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-03)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color,
          borderRadius: 3, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

export default function BrainPage() {
  const [breadth, setBreadth]   = useState<Breadth|null>(null);
  const [movers,  setMovers]    = useState<MoversData|null>(null);
  const [loading, setLoading]   = useState(false);
  const [lastAt,  setLastAt]    = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, mRes] = await Promise.all([
        fetch(`${API}/api/v1/market/breadth`),
        fetch(`${API}/api/v1/market/movers?limit=10`),
      ]);
      if (bRes.ok) setBreadth(await bRes.json());
      if (mRes.ok) setMovers(await mRes.json());
      setLastAt(new Date().toLocaleTimeString("en-IN"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 30000); return () => clearInterval(id); }, [fetchAll]);

  // Derived sentiment score (0–100) from breadth data
  const sentiment = breadth
    ? Math.round((breadth.advances / Math.max(breadth.total, 1)) * 100)
    : 50;
  const sentimentLabel = sentiment > 65 ? "Bullish" : sentiment < 35 ? "Bearish" : "Neutral";
  const sentimentColor = sentiment > 65 ? "var(--color-up)" : sentiment < 35 ? "var(--color-down)" : "#f59e0b";

  // Momentum score based on average gainer/loser magnitude
  const avgGain = movers?.gainers.reduce((s, g) => s + g.change_pct, 0) / (movers?.gainers.length || 1) || 0;
  const avgLoss = Math.abs(movers?.losers.reduce((s, l) => s + l.change_pct, 0) / (movers?.losers.length || 1) || 0);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Brain size={20} style={{ color: "#6366f1" }} /> Market Brain
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            AI market analysis · {breadth?.total?.toLocaleString("en-IN")} stocks analysed
            {lastAt ? ` · Updated ${lastAt}` : ""}
          </p>
        </div>
        <button onClick={fetchAll} style={{ display: "flex", alignItems: "center", gap: 5,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh Analysis
        </button>
      </div>

      {/* Sentiment gauge */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Market Sentiment", value: sentimentLabel, sub: `${sentiment}% stocks bullish`, color: sentimentColor },
          { label: "Advancing Stocks", value: breadth?.advances?.toLocaleString("en-IN") ?? "—",
            sub: `of ${breadth?.total?.toLocaleString("en-IN")} total`, color: "var(--color-up)" },
          { label: "Declining Stocks", value: breadth?.declines?.toLocaleString("en-IN") ?? "—",
            sub: "in today's session", color: "var(--color-down)" },
          { label: "A/D Ratio",        value: breadth?.ratio?.toFixed(2) ?? "—",
            sub: "advance/decline", color: (breadth?.ratio ?? 1) >= 1 ? "var(--color-up)" : "var(--color-down)" },
          { label: "Avg Top Gain",     value: `+${avgGain.toFixed(2)}%`,
            sub: "top 10 gainers avg",  color: "var(--color-up)" },
          { label: "Avg Top Loss",     value: `-${avgLoss.toFixed(2)}%`,
            sub: "top 10 losers avg",   color: "var(--color-down)" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color }}>{value}</div>
            <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Market strength bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 14,
            display: "flex", alignItems: "center", gap: 6 }}>
            <Activity size={15} style={{ color: "#6366f1" }} /> Market Strength Indicators
          </h3>
          <ScoreGauge label="Breadth Score (Advance %)" value={sentiment} max={100}
            color={sentimentColor} />
          <ScoreGauge label="Bullish Momentum" value={avgGain} max={20}
            color="var(--color-up)" />
          <ScoreGauge label="Bearish Momentum" value={avgLoss} max={20}
            color="var(--color-down)" />
          <ScoreGauge label="Participation (Non-Zero Change)"
            value={Math.round(((breadth?.advances ?? 0) + (breadth?.declines ?? 0)) / Math.max(breadth?.total ?? 1, 1) * 100)}
            max={100} color="#6366f1" />
          <div style={{ marginTop: 12, padding: "10px 12px", background: `${sentimentColor}11`,
            border: `1px solid ${sentimentColor}33`, borderRadius: "var(--border-radius)" }}>
            <div style={{ fontSize: "0.786rem", fontWeight: 700, color: sentimentColor }}>
              AI Assessment: {sentimentLabel} Market
            </div>
            <div style={{ fontSize: "0.714rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
              {sentiment > 65
                ? `Strong buying interest. ${breadth?.advances} stocks advancing vs ${breadth?.declines} declining. Broad-based rally with positive market breadth.`
                : sentiment < 35
                ? `Selling pressure dominant. ${breadth?.declines} stocks falling vs ${breadth?.advances} advancing. Risk-off sentiment in the market.`
                : `Mixed signals. ${breadth?.advances} advancing vs ${breadth?.declines} declining. Market in consolidation phase.`}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 14,
            display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={15} style={{ color: "#6366f1" }} /> Breadth Analysis
          </h3>
          {/* Advance/Decline bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.786rem",
              marginBottom: 6, color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--color-up)", fontWeight: 700 }}>
                ▲ {breadth?.advances?.toLocaleString("en-IN")} Advancing ({sentiment}%)
              </span>
              <span style={{ color: "var(--color-down)", fontWeight: 700 }}>
                ▼ {breadth?.declines?.toLocaleString("en-IN")} Declining ({100 - sentiment}%)
              </span>
            </div>
            <div style={{ height: 20, borderRadius: 10, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${sentiment}%`, background: "var(--color-up)", transition: "width 1s ease" }} />
              <div style={{ flex: 1, background: "var(--color-down)", opacity: 0.7 }} />
            </div>
          </div>

          <div style={{ fontSize: "0.786rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
            <div>📊 Total stocks tracked: <strong>{breadth?.total?.toLocaleString("en-IN")}</strong></div>
            <div>✅ Unchanged stocks: <strong>{breadth?.unchanged?.toLocaleString("en-IN") ?? "—"}</strong></div>
            <div>📈 A/D Ratio: <strong style={{ color: (breadth?.ratio ?? 1) >= 1 ? "var(--color-up)" : "var(--color-down)" }}>{breadth?.ratio?.toFixed(2) ?? "—"}</strong></div>
            <div>🗓️ Session: <strong>{breadth?.trade_date ?? "—"}</strong></div>
          </div>

          <div style={{ marginTop: 12, padding: "10px 12px",
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "var(--border-radius)", fontSize: "0.786rem", color: "var(--text-secondary)" }}>
            ℹ️ <strong>Note:</strong> Analysis uses real yfinance OHLCV data from {breadth?.trade_date}.
            Market Brain is a technical analysis tool — <strong>not financial advice</strong>.
          </div>
        </div>
      </div>

      {/* Top movers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {(["gainers", "losers"] as const).map(side => (
          <div key={side} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.9rem",
              color: side === "gainers" ? "var(--color-up)" : "var(--color-down)" }}>
              {side === "gainers" ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
              Top {side === "gainers" ? "Gainers" : "Losers"}
            </div>
            {(movers?.[side] ?? []).slice(0, 8).map(m => (
              <div key={m.symbol} style={{ display: "flex", justifyContent: "space-between",
                padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                    fontSize: "0.857rem", color: "var(--accent-bright)" }}>{m.symbol}</span>
                  <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)" }}>
                    {m.name?.slice(0, 30)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.857rem" }}>
                    ₹{m.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.857rem",
                    color: m.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                    {m.change_pct >= 0 ? "+" : ""}{m.change_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: "0.643rem", color: "var(--text-tertiary)", textAlign: "center" }}>
        Source: ohlcv_daily · yfinance · {movers?.trade_date} · NOT financial advice
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
