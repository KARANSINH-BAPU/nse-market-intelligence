"use client";
/**
 * KP — AI Predictions (Composite Signal Engine)
 *
 * FIX: Previous version showed 1 row per signal per stock → 3x duplicates,
 * conflicting BUY+SELL on same stock, confusing UI.
 *
 * NOW: Groups all signals per stock → computes ONE composite recommendation
 * with multi-signal agreement count, confidence score, entry/target/stop-loss.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Zap, RefreshCw, AlertTriangle,
         Target, ShieldAlert, BarChart2, Activity } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Raw signal from /api/v1/signals ─────────────────────────────────────────
interface RawSignal {
  symbol: string; name: string; sector: string | null;
  signal_type: string; strength: string;
  rsi: number | null; macd: number | null; close: number; change_pct: number;
  sma20: number | null;
  buy_price: number | null; sell_price: number | null;
  target: number | null; stop_loss: number | null;
  trade_date: string;
}

// ── Composite prediction per stock ───────────────────────────────────────────
interface Prediction {
  symbol: string; name: string; sector: string | null;
  action: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  score: number;          // -3 to +3 (negative = bearish, positive = bullish)
  confidence: number;     // 0-100 %
  signals: string[];      // e.g. ["RSI Oversold", "MACD Bullish"]
  bullish: number;        // count of bullish signals
  bearish: number;        // count of bearish signals
  total_signals: number;
  rsi: number | null; macd: number | null; sma20: number | null;
  close: number; change_pct: number;
  entry: number | null;   // recommended entry price
  target: number | null;  // price target
  stop_loss: number | null;
  risk_reward: number | null; // target gain / stop loss %
  trade_date: string;
}

// Signal weights (positive = bullish, negative = bearish)
const SIGNAL_WEIGHT: Record<string, number> = {
  RSI_OVERSOLD:   +2,   // Strong reversal signal
  MACD_BULL:      +1.5, // Momentum turning bullish
  SMA_BULL:       +1,   // Trend confirmation
  RSI_OVERBOUGHT: -2,   // Overbought, likely to pull back
  MACD_BEAR:      -1.5, // Momentum turning bearish
  SMA_BEAR:       -1,   // Below trend, bearish
};
const SIGNAL_LABELS: Record<string, string> = {
  RSI_OVERSOLD:   "RSI Oversold",
  MACD_BULL:      "MACD Bullish",
  SMA_BULL:       "Above SMA20",
  RSI_OVERBOUGHT: "RSI Overbought",
  MACD_BEAR:      "MACD Bearish",
  SMA_BEAR:       "Below SMA20",
};

function buildPredictions(rawSignals: RawSignal[]): Prediction[] {
  // Group by symbol
  const bySymbol = new Map<string, RawSignal[]>();
  for (const s of rawSignals) {
    if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, []);
    bySymbol.get(s.symbol)!.push(s);
  }

  const predictions: Prediction[] = [];

  for (const [symbol, signals] of bySymbol) {
    const base = signals[0];
    const close = base.close;

    // Compute composite score
    let score = 0;
    let bullish = 0;
    let bearish = 0;
    const signalLabels: string[] = [];

    for (const sig of signals) {
      const w = SIGNAL_WEIGHT[sig.signal_type] ?? 0;
      score += w;
      if (w > 0) { bullish++; signalLabels.push(`🟢 ${SIGNAL_LABELS[sig.signal_type]}`); }
      if (w < 0) { bearish++; signalLabels.push(`🔴 ${SIGNAL_LABELS[sig.signal_type]}`); }
    }

    // Determine action
    let action: Prediction["action"];
    const maxScore = Object.values(SIGNAL_WEIGHT).filter(v => v > 0).reduce((a,b) => a+b, 0); // 4.5
    const minScore = Object.values(SIGNAL_WEIGHT).filter(v => v < 0).reduce((a,b) => a+b, 0); // -4.5

    if      (score >= 3)   action = "STRONG BUY";
    else if (score >= 1.5) action = "BUY";
    else if (score <= -3)  action = "STRONG SELL";
    else if (score <= -1.5) action = "SELL";
    else                   action = "HOLD";

    // Skip pure HOLDs (conflicting or no conviction)
    if (action === "HOLD" && bullish > 0 && bearish > 0) {
      // Still include if there's >1 bullish or >1 bearish
      if (bullish <= 1 && bearish <= 1) continue;
    }

    // Confidence = how many signals agree / total * 100
    const totalSigs = bullish + bearish;
    const agreeingCount = score >= 0 ? bullish : bearish;
    const confidence = totalSigs > 0 ? Math.round((agreeingCount / totalSigs) * 100) : 50;

    const isBull = score > 0;

    // Entry price: for BUY use SMA20 support, for SELL use current price
    const sma20 = base.sma20;
    let entry: number | null = null;
    if (isBull) {
      // Buy near SMA20 if price is above it (i.e. pullback entry)
      // or at current price if oversold
      entry = base.buy_price ?? (sma20 ? Math.min(close, sma20 * 1.01) : close);
    } else {
      // Sell at current price
      entry = base.sell_price ?? close;
    }
    entry = entry ? parseFloat(entry.toFixed(2)) : null;

    // Target & stop-loss based on action strength
    const tgtPct  = score >= 3 ? 0.10 : score >= 1.5 ? 0.07 : 0.05; // +10%, +7%, +5%
    const slPct   = score >= 3 ? 0.04 : 0.035;                        // -4%, -3.5%
    let target: number | null = null;
    let stop_loss: number | null = null;

    if (isBull && entry) {
      target    = parseFloat((entry * (1 + tgtPct)).toFixed(2));
      stop_loss = parseFloat((entry * (1 - slPct)).toFixed(2));
    } else if (!isBull && entry) {
      // For SELL: target is price going DOWN, stop is above
      target    = parseFloat((entry * (1 - tgtPct)).toFixed(2));
      stop_loss = parseFloat((entry * (1 + slPct)).toFixed(2));
    }

    // Risk-reward ratio: target gain / stop-loss loss
    let risk_reward: number | null = null;
    if (entry && target && stop_loss) {
      const gain = Math.abs(target - entry);
      const loss = Math.abs(stop_loss - entry);
      risk_reward = loss > 0 ? parseFloat((gain / loss).toFixed(1)) : null;
    }

    predictions.push({
      symbol, name: base.name, sector: base.sector,
      action, score: parseFloat(score.toFixed(1)), confidence,
      signals: signalLabels,
      bullish, bearish, total_signals: totalSigs,
      rsi: base.rsi, macd: base.macd, sma20,
      close, change_pct: base.change_pct,
      entry, target, stop_loss, risk_reward,
      trade_date: base.trade_date,
    });
  }

  // Sort: STRONG BUY first, then BUY, then SELL, then STRONG SELL, then HOLD
  const ORDER = { "STRONG BUY": 0, "BUY": 1, "HOLD": 4, "SELL": 2, "STRONG SELL": 3 };
  predictions.sort((a, b) => {
    const od = (ORDER[a.action] ?? 4) - (ORDER[b.action] ?? 4);
    if (od !== 0) return od;
    return b.confidence - a.confidence;
  });

  return predictions;
}

function fmtPrc(n: number | null) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ACTION_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "STRONG BUY":  { bg: "rgba(34,197,94,0.2)",  color: "#22c55e", border: "rgba(34,197,94,0.5)" },
  "BUY":         { bg: "rgba(52,211,153,0.15)", color: "#34d399", border: "rgba(52,211,153,0.4)" },
  "HOLD":        { bg: "rgba(148,148,168,0.1)", color: "#9494a8", border: "rgba(148,148,168,0.3)" },
  "SELL":        { bg: "rgba(248,113,113,0.15)",color: "#f87171", border: "rgba(248,113,113,0.4)" },
  "STRONG SELL": { bg: "rgba(239,68,68,0.2)",   color: "#ef4444", border: "rgba(239,68,68,0.5)" },
};

export default function PredictionsPage() {
  const [raw,      setRaw]      = useState<RawSignal[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string|null>(null);
  const [view,     setView]     = useState<"all" | "buy" | "sell">("all");
  const [minConf,  setMinConf]  = useState(0);       // default: show ALL
  const [tradeDate, setDate]    = useState("");
  const [scanned,  setScanned]  = useState(0);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/v1/signals?limit=10000`);
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`API error ${r.status}: ${txt.slice(0,200)}`);
      }
      const d = await r.json();
      setRaw(d.signals ?? []);
      setDate(d.trade_date ?? "");
      setScanned(d.scanned ?? 0);
    } catch(e: any) {
      setError(e.message ?? "Failed to load signals");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  // Build composite predictions (1 per stock)
  const allPreds = buildPredictions(raw);
  const buyPreds  = allPreds.filter(p => p.action.includes("BUY"));
  const sellPreds = allPreds.filter(p => p.action.includes("SELL"));

  const shown = (view === "buy" ? buyPreds : view === "sell" ? sellPreds : allPreds)
    .filter(p => p.confidence >= minConf);

  // Summary stats
  const strongBuy  = allPreds.filter(p => p.action === "STRONG BUY").length;
  const buy        = allPreds.filter(p => p.action === "BUY").length;
  const sell       = allPreds.filter(p => p.action === "SELL").length;
  const strongSell = allPreds.filter(p => p.action === "STRONG SELL").length;

  return (
    <div style={{ maxWidth: 1600, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={20} style={{ color: "#6366f1" }} /> AI Predictions — Composite Signals
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            RSI(14) · MACD(12,26,9) · SMA(20) — merged into <strong style={{ color: "var(--text-secondary)" }}>1 prediction per stock</strong> ·&nbsp;
            {scanned.toLocaleString("en-IN")} stocks scanned · {allPreds.length} unique stocks ·&nbsp;
            📈 {buyPreds.length} BUY · 📉 {sellPreds.length} SELL · {tradeDate}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={minConf} onChange={e => setMinConf(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: "var(--border-radius)",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", fontSize: "0.786rem" }}>
            <option value={0}>All Confidence</option>
            <option value={67}>High Confidence (≥67%)</option>
            <option value={100}>Max Confidence (100%)</option>
          </select>
          <button onClick={scan}
            style={{ display: "flex", alignItems: "center", gap: 5,
              background: "var(--accent)", border: "none", color: "#fff",
              borderRadius: "var(--border-radius)", padding: "6px 14px",
              cursor: "pointer", fontSize: "0.786rem", fontWeight: 600 }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        gap: 10, marginBottom: 20 }}>
        {[
          { label: "Strong BUY 🚀", val: strongBuy,  col: "#22c55e" },
          { label: "BUY ✅",         val: buy,         col: "#34d399" },
          { label: "SELL ⚠️",        val: sell,         col: "#f87171" },
          { label: "Strong SELL 🔴", val: strongSell,  col: "#ef4444" },
          { label: "Stocks Analyzed",val: allPreds.length, col: "var(--text-primary)" },
          { label: "Scanned",        val: scanned,     col: "var(--text-secondary)" },
        ].map(({ label, val, col }) => (
          <div key={label} className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.643rem", color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: "1.4rem", color: col }}>{val.toLocaleString("en-IN")}</div>
          </div>
        ))}
      </div>

      {/* BUY/SELL filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([
          { id: "all",  label: `All (${allPreds.length})`,    col: "var(--accent-bright)" },
          { id: "buy",  label: `▲ BUY (${buyPreds.length})`,  col: "var(--color-up)" },
          { id: "sell", label: `▼ SELL (${sellPreds.length})`, col: "var(--color-down)" },
        ] as const).map(({ id, label, col }) => (
          <button key={id} onClick={() => setView(id as any)}
            style={{ padding: "7px 18px", borderRadius: "var(--border-radius)", fontWeight: 700,
              border: `2px solid ${view === id ? col : "transparent"}`,
              background: view === id ? `${col}18` : "var(--surface-03)",
              color: view === id ? col : "var(--text-tertiary)",
              cursor: "pointer", fontSize: "0.857rem", transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)",
          borderRadius: "var(--border-radius)", padding: "10px 14px", marginBottom: 14,
          display: "flex", gap: 8, fontSize: "0.786rem", color: "#f87171", alignItems: "center" }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span><strong>Error loading predictions:</strong> {error}</span>
          <button onClick={scan} style={{ marginLeft: "auto", padding: "3px 10px",
            borderRadius: 4, border: "1px solid #f87171", background: "transparent",
            color: "#f87171", cursor: "pointer", fontSize: "0.714rem" }}>Retry</button>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "8px 14px", marginBottom: 14,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        AI composite scoring: RSI(14) + MACD(12,26,9) + SMA(20) → one score per stock.
        Each stock shows a single BUY/SELL/HOLD recommendation with signal agreement.
        NOT financial advice — do your own research.
      </div>

      {/* Signal legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: "0.714rem",
        color: "var(--text-tertiary)", flexWrap: "wrap" }}>
        <span><strong style={{ color: "#22c55e" }}>STRONG BUY</strong> = Score ≥3 (multiple bullish signals agree)</span>
        <span><strong style={{ color: "#34d399" }}>BUY</strong> = Score 1.5–3 (mostly bullish)</span>
        <span><strong style={{ color: "#f87171" }}>SELL</strong> = Score -1.5 to -3 (mostly bearish)</span>
        <span><strong style={{ color: "#ef4444" }}>STRONG SELL</strong> = Score ≤-3 (multiple bearish signals)</span>
        <span>Confidence = % signals agreeing with final call</span>
        <span>R/R = Risk-Reward ratio</span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="kp-table" style={{ margin: 0, minWidth: 1200 }}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name / Sector</th>
                <th style={{ textAlign: "center" }}>AI Call</th>
                <th style={{ textAlign: "center" }}>Signals</th>
                <th style={{ textAlign: "center" }}>Confidence</th>
                <th style={{ textAlign: "right" }}>LTP ₹</th>
                <th style={{ textAlign: "right" }}>Change %</th>
                <th style={{ textAlign: "right" }}>RSI</th>
                <th style={{ textAlign: "right" }}>MACD</th>
                <th style={{ textAlign: "right", color: "#22c55e" }}>Entry ₹</th>
                <th style={{ textAlign: "right", color: "#6366f1" }}>Target ₹</th>
                <th style={{ textAlign: "right", color: "#f59e0b" }}>Stop Loss ₹</th>
                <th style={{ textAlign: "center" }}>R/R</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} style={{ textAlign: "center", padding: "50px 0",
                  color: "var(--text-tertiary)" }}>
                  <RefreshCw size={20} style={{ animation: "spin 1s linear infinite",
                    margin: "0 auto 8px", display: "block" }} />
                  Computing composite predictions for {scanned.toLocaleString("en-IN")}+ stocks…
                </td></tr>
              )}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={13} style={{ textAlign: "center", padding: "50px 0",
                  color: "var(--text-tertiary)" }}>No predictions match the selected filter.</td></tr>
              )}
              {!loading && shown.slice(0, 300).map((p) => {
                const ast = ACTION_STYLE[p.action] ?? ACTION_STYLE["HOLD"];
                const isBull = p.action.includes("BUY");
                const isBear = p.action.includes("SELL");
                return (
                  <tr key={p.symbol}>
                    {/* Symbol */}
                    <td>
                      <Link href={`/instruments/${p.symbol}`}
                        style={{ fontFamily: "var(--font-mono)", fontWeight: 700,
                          color: "var(--accent-bright)", textDecoration: "none" }}>
                        {p.symbol}
                      </Link>
                    </td>
                    {/* Name / Sector */}
                    <td style={{ fontSize: "0.786rem", color: "var(--text-secondary)", maxWidth: 160 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" }}>{p.name}</span>
                      {p.sector && <span style={{ fontSize: "0.643rem", color: "var(--text-tertiary)" }}>{p.sector}</span>}
                    </td>
                    {/* AI Call */}
                    <td style={{ textAlign: "center" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 5, fontSize: "0.786rem",
                        fontWeight: 800, letterSpacing: "0.04em",
                        background: ast.bg, color: ast.color,
                        border: `1px solid ${ast.border}`, display: "inline-block" }}>
                        {isBull ? "▲" : isBear ? "▼" : "—"} {p.action}
                      </span>
                    </td>
                    {/* Signals breakdown */}
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                        {p.bullish > 0 && (
                          <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.643rem",
                            fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#22c55e",
                            border: "1px solid rgba(34,197,94,0.25)" }}>
                            🟢×{p.bullish}
                          </span>
                        )}
                        {p.bearish > 0 && (
                          <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: "0.643rem",
                            fontWeight: 700, background: "rgba(239,68,68,0.12)", color: "#ef4444",
                            border: "1px solid rgba(239,68,68,0.25)" }}>
                            🔴×{p.bearish}
                          </span>
                        )}
                        {/* Tooltip-style signal names on hover */}
                        <span title={p.signals.join("\n")} style={{ cursor: "help",
                          fontSize: "0.643rem", color: "var(--text-tertiary)" }}>ℹ</span>
                      </div>
                    </td>
                    {/* Confidence */}
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <span style={{ fontWeight: 800, fontSize: "0.857rem",
                          color: p.confidence >= 67 ? "#22c55e" : p.confidence >= 50 ? "#f59e0b" : "#9494a8" }}>
                          {p.confidence}%
                        </span>
                        {/* Mini confidence bar */}
                        <div style={{ width: 40, height: 3, background: "var(--surface-04)", borderRadius: 2 }}>
                          <div style={{ width: `${p.confidence}%`, height: "100%", borderRadius: 2,
                            background: p.confidence >= 67 ? "#22c55e" : p.confidence >= 50 ? "#f59e0b" : "#9494a8" }} />
                        </div>
                      </div>
                    </td>
                    {/* LTP */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      ₹{p.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    {/* Change % */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: p.change_pct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
                      {p.change_pct >= 0 ? "+" : ""}{p.change_pct.toFixed(2)}%
                    </td>
                    {/* RSI */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      color: p.rsi != null
                        ? (p.rsi < 30 ? "#22c55e" : p.rsi > 70 ? "#ef4444" : "var(--text-secondary)")
                        : "var(--text-tertiary)" }}>
                      {p.rsi?.toFixed(1) ?? "—"}
                    </td>
                    {/* MACD */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      color: p.macd != null
                        ? (p.macd > 0 ? "#22c55e" : "#ef4444")
                        : "var(--text-tertiary)" }}>
                      {p.macd?.toFixed(3) ?? "—"}
                    </td>
                    {/* Entry */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      fontWeight: 700, color: isBull ? "#22c55e" : isBear ? "#ef4444" : "var(--text-secondary)" }}>
                      {fmtPrc(p.entry)}
                    </td>
                    {/* Target */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      fontWeight: 700, color: "#818cf8" }}>
                      {fmtPrc(p.target)}
                    </td>
                    {/* Stop Loss */}
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "0.857rem",
                      fontWeight: 700, color: "#f59e0b" }}>
                      {fmtPrc(p.stop_loss)}
                    </td>
                    {/* Risk-Reward */}
                    <td style={{ textAlign: "center" }}>
                      {p.risk_reward != null ? (
                        <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: "0.714rem",
                          fontWeight: 700,
                          background: p.risk_reward >= 2 ? "rgba(99,102,241,0.15)" : "var(--surface-03)",
                          color: p.risk_reward >= 2 ? "var(--accent-bright)" : "var(--text-tertiary)" }}>
                          {p.risk_reward}:1
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {shown.length > 300 && (
        <div style={{ textAlign: "center", padding: "12px", fontSize: "0.786rem",
          color: "var(--text-tertiary)" }}>
          Showing top 300 of {shown.length}. Use Confidence filter to narrow down.
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
