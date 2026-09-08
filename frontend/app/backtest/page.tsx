"use client";
/**
 * KP — Backtesting Page
 * Run simple RSI/MACD/SMA strategies on real historical OHLCV data.
 */
import { useState, useCallback } from "react";
import { TestTube2, Play, TrendingUp, TrendingDown, BarChart2, AlertTriangle } from "lucide-react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Trade { date: string; action: "BUY"|"SELL"; price: number; pnl?: number; }
interface BacktestResult {
  symbol: string; strategy: string; trades: Trade[];
  total_return_pct: number; win_rate: number; total_trades: number;
  max_drawdown: number; sharpe: number; from_date: string; to_date: string;
}

const STRATEGIES = [
  { id: "rsi_oversold",  label: "RSI Oversold (<30) Buy",   desc: "Buy when RSI < 30, Sell when RSI > 65" },
  { id: "macd_cross",    label: "MACD Crossover",            desc: "Buy on MACD bullish cross, Sell on bearish" },
  { id: "sma_breakout",  label: "SMA20 Breakout",            desc: "Buy above SMA20, Sell below SMA20" },
  { id: "dual_ma",       label: "Dual MA (SMA20/EMA12)",     desc: "Buy when EMA12 > SMA20, Sell otherwise" },
];

export default function BacktestPage() {
  const [symbol,   setSymbol]   = useState("RELIANCE");
  const [strategy, setStrategy] = useState("rsi_oversold");
  const [result,   setResult]   = useState<BacktestResult|null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const runBacktest = useCallback(async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(
        `${API}/api/v1/ohlcv/${symbol.toUpperCase().trim()}?period=1y`
      );
      if (!r.ok) { setError(`No data for ${symbol}. Check symbol is a valid NSE ticker.`); return; }
      const d = await r.json();

      // Simulate backtest on closes array using selected strategy
      const bars  = d.bars ?? [];
      if (bars.length < 30) { setError("Not enough historical data (need 30+ bars)"); return; }

      const closes  = bars.map((b: any) => b.close);
      const trades: Trade[] = [];
      let inPosition = false;
      let buyPrice   = 0;
      let totalPnl   = 0;
      let wins       = 0;

      for (let i = 26; i < bars.length; i++) {
        const rsi  = (bars[i].rsi ?? 50) as number;
        const price = closes[i];
        const date  = bars[i].trade_date ?? bars[i].date ?? `Day ${i}`;

        let signal: "BUY"|"SELL"|null = null;

        if (strategy === "rsi_oversold") {
          if (!inPosition && rsi < 30)  signal = "BUY";
          if ( inPosition && rsi > 65)  signal = "SELL";
        } else if (strategy === "sma_breakout") {
          const sma = closes.slice(i-20, i).reduce((a: number,b: number)=>a+b,0)/20;
          if (!inPosition && price > sma) signal = "BUY";
          if ( inPosition && price < sma) signal = "SELL";
        } else if (strategy === "macd_cross") {
          const ema12 = closes.slice(i-12,i).reduce((a:number,b:number)=>a+b,0)/12;
          const ema26 = closes.slice(i-26,i).reduce((a:number,b:number)=>a+b,0)/26;
          const macd  = ema12 - ema26;
          if (!inPosition && macd > 0) signal = "BUY";
          if ( inPosition && macd < 0) signal = "SELL";
        } else {
          const sma20 = closes.slice(i-20,i).reduce((a:number,b:number)=>a+b,0)/20;
          const ema12 = closes.slice(i-12,i).reduce((a:number,b:number)=>a+b,0)/12;
          if (!inPosition && ema12 > sma20) signal = "BUY";
          if ( inPosition && ema12 < sma20) signal = "SELL";
        }

        if (signal === "BUY" && !inPosition) {
          trades.push({ date, action: "BUY", price });
          buyPrice = price; inPosition = true;
        } else if (signal === "SELL" && inPosition) {
          const pnl = ((price - buyPrice) / buyPrice) * 100;
          trades.push({ date, action: "SELL", price, pnl });
          totalPnl += pnl;
          if (pnl > 0) wins++;
          inPosition = false;
        }
      }
      // Close open position at end
      if (inPosition && closes.length > 0) {
        const price = closes[closes.length - 1];
        const pnl   = ((price - buyPrice) / buyPrice) * 100;
        trades.push({ date: bars[bars.length-1]?.trade_date ?? "End", action: "SELL", price, pnl });
        totalPnl += pnl; if (pnl > 0) wins++;
      }

      const completedTrades = trades.filter(t => t.action === "SELL");
      setResult({
        symbol:           symbol.toUpperCase(),
        strategy,
        trades,
        total_return_pct: Math.round(totalPnl * 100) / 100,
        win_rate:         completedTrades.length ? Math.round((wins/completedTrades.length)*100) : 0,
        total_trades:     completedTrades.length,
        max_drawdown:     Math.min(...(completedTrades.map(t=>t.pnl??0)), 0),
        sharpe:           completedTrades.length > 1 ? parseFloat((totalPnl / completedTrades.length / 2).toFixed(2)) : 0,
        from_date:        bars[0]?.trade_date ?? "",
        to_date:          bars[bars.length-1]?.trade_date ?? "",
      });
    } catch (e: any) {
      setError(e.message ?? "Backtest failed");
    } finally { setLoading(false); }
  }, [symbol, strategy]);

  const strat = STRATEGIES.find(s => s.id === strategy);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
          display: "flex", alignItems: "center", gap: 8 }}>
          <TestTube2 size={20} style={{ color: "#6366f1" }} /> Backtesting
        </h1>
        <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Test trading strategies on real NSE historical data (1-year OHLCV from yfinance)
        </p>
      </div>

      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: "var(--border-radius)", padding: "8px 14px", marginBottom: 20,
        display: "flex", gap: 8, fontSize: "0.786rem", color: "var(--text-secondary)" }}>
        <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Past performance does not guarantee future results. For educational purposes only.
      </div>

      {/* Config panel */}
      <div className="card" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 16 }}>Strategy Configuration</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: "0.786rem", color: "var(--text-secondary)",
              display: "block", marginBottom: 6 }}>NSE Symbol</label>
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE, TCS, INFY"
              style={{ width: "100%", padding: "8px 12px", background: "var(--surface-03)",
                border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
                color: "var(--text-primary)", fontSize: "0.857rem", fontFamily: "var(--font-mono)" }} />
          </div>
          <div>
            <label style={{ fontSize: "0.786rem", color: "var(--text-secondary)",
              display: "block", marginBottom: 6 }}>Strategy</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--surface-03)",
                border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
                color: "var(--text-primary)", fontSize: "0.857rem" }}>
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <button onClick={runBacktest} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px",
              background: loading ? "var(--surface-03)" : "var(--accent)",
              border: "none", borderRadius: "var(--border-radius)", color: "#fff",
              cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.857rem" }}>
            <Play size={14} fill="white" /> {loading ? "Running…" : "Run Backtest"}
          </button>
        </div>
        {strat && (
          <div style={{ marginTop: 10, fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            📋 {strat.desc} · 1-year OHLCV data · NSE equity
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "var(--border-radius)", padding: "12px 16px", marginBottom: 16,
          color: "var(--color-down)" }}>{error}</div>
      )}

      {result && (
        <>
          {/* Results summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Return",   val: `${result.total_return_pct >= 0 ? "+" : ""}${result.total_return_pct}%`,
                color: result.total_return_pct >= 0 ? "var(--color-up)" : "var(--color-down)" },
              { label: "Win Rate",       val: `${result.win_rate}%`,
                color: result.win_rate >= 50 ? "var(--color-up)" : "var(--color-down)" },
              { label: "Total Trades",   val: result.total_trades, color: "var(--text-primary)" },
              { label: "Max Drawdown",   val: `${result.max_drawdown.toFixed(2)}%`,
                color: "var(--color-down)" },
              { label: "Avg per Trade",  val: result.total_trades ? `${(result.total_return_pct/result.total_trades).toFixed(2)}%` : "—",
                color: "var(--text-primary)" },
              { label: "Period",         val: `${result.from_date} → ${result.to_date}`,
                color: "var(--text-secondary)" },
            ].map(({ label, val, color }) => (
              <div key={label} className="card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>{label}</div>
                <div style={{ fontWeight: 700, color, marginTop: 2, fontSize: "0.9rem" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Trade log */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)",
              fontWeight: 700, fontSize: "0.9rem" }}>
              Trade Log — {result.symbol} · {strat?.label}
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <table className="kp-table" style={{ margin: 0 }}>
                <thead><tr>
                  <th>#</th><th>Date</th><th>Action</th>
                  <th style={{ textAlign: "right" }}>Price ₹</th>
                  <th style={{ textAlign: "right" }}>P&amp;L %</th>
                </tr></thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--text-tertiary)", fontSize: "0.786rem" }}>{i+1}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem" }}>{t.date}</td>
                      <td>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem",
                          fontWeight: 700,
                          background: t.action === "BUY" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: t.action === "BUY" ? "var(--color-up)" : "var(--color-down)" }}>
                          {t.action === "BUY" ? "▲ BUY" : "▼ SELL"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        ₹{t.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: t.pnl != null ? (t.pnl >= 0 ? "var(--color-up)" : "var(--color-down)") : "var(--text-tertiary)" }}>
                        {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
