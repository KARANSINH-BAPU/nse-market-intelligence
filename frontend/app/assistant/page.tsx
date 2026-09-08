"use client";
/**
 * KP — AI Assistant (Chat) — Fixed v2
 * Works for ANY query pattern: "status of RELIANCE", "tell me INFY", etc.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, User, Sparkles, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Msg { role: "user" | "assistant"; content: string; ts: Date; }

const SUGGESTIONS = [
  "Top gainers today",
  "Oversold stocks (RSI < 30)",
  "Best performing sectors",
  "Status of RELIANCE",
  "Market breadth today",
  "MACD bullish signals",
  "Status of TCS",
  "Status of INFY",
];

// ── Intent detection ─────────────────────────────────────────
function detectIntent(q: string): { type: string; symbol?: string; extra?: string } {
  const t = q.trim().toUpperCase();

  // "STATUS OF <SYMBOL>" / "TELL ME ABOUT <SYMBOL>" / "SHOW <SYMBOL>" / "ANALYSE <SYMBOL>"
  const stockPatterns = [
    /STATUS\s+OF\s+([A-Z0-9\-]{2,15})/,
    /TELL\s+ME\s+(?:ABOUT\s+)?([A-Z0-9\-]{2,15})/,
    /SHOW\s+(?:ME\s+)?([A-Z0-9\-]{2,15})/,
    /ANALYSE?\s+([A-Z0-9\-]{2,15})/,
    /ABOUT\s+([A-Z0-9\-]{2,15})/,
    /INFO\s+(?:ON\s+)?([A-Z0-9\-]{2,15})/,
    /STOCK\s+([A-Z0-9\-]{2,15})/,
    /PRICE\s+OF\s+([A-Z0-9\-]{2,15})/,
    /WHAT\s+IS\s+([A-Z0-9\-]{2,15})/,
  ];
  for (const pat of stockPatterns) {
    const m = t.match(pat);
    if (m) return { type: "stock", symbol: m[1] };
  }

  // Market breadth
  if (/BREADTH|HOW\s+IS\s+MARKET|ADVANCE|DECLINE|MARKET\s+STATUS|MARKET\s+TODAY/.test(t))
    return { type: "breadth" };

  // Gainers
  if (/GAINER|TOP\s+PERFORM|BEST\s+STOCK|RISING/.test(t))
    return { type: "gainers" };

  // Losers
  if (/LOSER|WORST|DECLIN|FALLING|DOWN\s+STOCK/.test(t))
    return { type: "losers" };

  // Oversold / RSI
  if (/OVERSOLD|RSI\s*<?\s*30|BUY\s+SIGNAL|UNDERVALUED/.test(t))
    return { type: "rsi_oversold" };

  // Overbought
  if (/OVERBOUGHT|RSI\s*>?\s*70|SELL\s+SIGNAL|OVERVALUED/.test(t))
    return { type: "rsi_overbought" };

  // MACD
  if (/MACD|CROSS[OV]+|MOMENTUM/.test(t))
    return { type: "macd" };

  // Sectors
  if (/SECTOR|INDUSTRY|SEGMENT/.test(t))
    return { type: "sectors" };

  // News
  if (/NEWS|LATEST|UPDATE|HEADLINE/.test(t))
    return { type: "news" };

  // Help / default
  if (/HELP|WHAT\s+CAN|WHAT\s+DO/.test(t))
    return { type: "help" };

  // Last chance — bare NSE symbol (2-15 uppercase chars, no spaces if input ≤ 15 chars)
  const bare = t.trim().replace(/[^A-Z0-9\-&]/g, "");
  if (bare.length >= 2 && bare.length <= 15 && /^[A-Z]/.test(bare))
    return { type: "stock", symbol: bare };

  return { type: "unknown" };
}

// ── Response generators ──────────────────────────────────────
async function respondToIntent(intent: ReturnType<typeof detectIntent>): Promise<string> {
  switch (intent.type) {

    case "stock": {
      const sym = intent.symbol!;
      // Try market/search first for fast price, then OHLCV for indicators
      const [searchRes, ohlcvRes] = await Promise.allSettled([
        fetch(`${API}/api/v1/market/search?q=${sym}&limit=1`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/v1/ohlcv/${sym}?period=1m`).then(r => r.ok ? r.json() : null),
      ]);

      const sr = searchRes.status === "fulfilled" ? searchRes.value : null;
      const or = ohlcvRes.status  === "fulfilled" ? ohlcvRes.value  : null;

      const stockInfo = sr?.results?.[0] ?? null;
      const bars      = or?.bars ?? [];
      const latest    = bars[bars.length - 1] ?? null;

      const price    = stockInfo?.close ?? latest?.close;
      const changePct = stockInfo?.change_pct ?? latest?.change_pct;
      const rsi      = latest?.rsi;
      const macd     = latest?.macd;
      const sma20    = latest?.sma20;
      const high52   = bars.length ? Math.max(...bars.map((b: any) => b.high)) : null;
      const low52    = bars.length ? Math.min(...bars.map((b: any) => b.low))  : null;

      if (!price) {
        return `❌ **${sym}** — No data found.\n\nMake sure you're using an NSE symbol like RELIANCE, TCS, INFY, SBIN.\n\nTip: Try "Status of RELIANCE" or just type "RELIANCE"`;
      }

      const rsiSignal = rsi != null
        ? (rsi < 30 ? "🟢 **Oversold** (BUY zone)" : rsi > 70 ? "🔴 **Overbought** (SELL zone)" : "⚪ Neutral")
        : "—";
      const macdSignal = macd != null ? (macd > 0 ? "📈 Bullish" : "📉 Bearish") : "—";
      const trend = changePct != null ? (changePct >= 0 ? "📈 Bullish" : "📉 Bearish") : "—";

      return `📊 **${sym}** — ${stockInfo?.name ?? "NSE Stock"}\n\n` +
        `💰 **Price:** ₹${price.toFixed(2)}\n` +
        `📊 **Change:** ${changePct != null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—"}\n` +
        `📈 **Trend:** ${trend}\n` +
        `\n📉 **Technical Indicators:**\n` +
        `• RSI(14): **${rsi?.toFixed(1) ?? "—"}** — ${rsiSignal}\n` +
        `• MACD: **${macd?.toFixed(3) ?? "—"}** — ${macdSignal}\n` +
        `• SMA(20): **${sma20 != null ? `₹${sma20.toFixed(2)}` : "—"}**\n` +
        `• Price vs SMA20: **${sma20 && price ? (price > sma20 ? "Above ↑ Bullish" : "Below ↓ Bearish") : "—"}**\n` +
        (high52 ? `\n📐 **1-Month Range:** ₹${low52!.toFixed(2)} — ₹${high52.toFixed(2)}\n` : "") +
        (bars.length ? `\n📅 **Data:** ${bars.length} trading days · Source: NSE ohlcv_daily\n` : "") +
        `\n*⚠️ Technical analysis only — NOT financial advice*`;
    }

    case "gainers": {
      const r = await fetch(`${API}/api/v1/market/movers?limit=8`);
      if (!r.ok) return "⚠️ Could not fetch gainers data right now.";
      const d = await r.json();
      const lines = (d.gainers ?? []).slice(0, 8).map((g: any, i: number) =>
        `${i + 1}. **${g.symbol}** — ₹${g.close.toFixed(2)} | **+${g.change_pct.toFixed(2)}%** 📈`
      ).join("\n");
      return `📈 **Top Gainers Today** (${d.trade_date ?? "latest"})\n\n${lines}\n\n` +
        `Total stocks tracked: **${(d.total_stocks ?? 0).toLocaleString("en-IN")}**\n` +
        `*Click any symbol in the Markets or Predictions page for details*`;
    }

    case "losers": {
      const r = await fetch(`${API}/api/v1/market/movers?limit=8`);
      if (!r.ok) return "⚠️ Could not fetch losers data right now.";
      const d = await r.json();
      const lines = (d.losers ?? []).slice(0, 8).map((g: any, i: number) =>
        `${i + 1}. **${g.symbol}** — ₹${g.close.toFixed(2)} | **${g.change_pct.toFixed(2)}%** 📉`
      ).join("\n");
      return `📉 **Top Losers Today** (${d.trade_date ?? "latest"})\n\n${lines}`;
    }

    case "breadth": {
      const r = await fetch(`${API}/api/v1/market/breadth`);
      if (!r.ok) return "⚠️ Could not fetch breadth data.";
      const d = await r.json();
      const bull = d.advances > d.declines;
      return `📊 **Market Breadth** — ${d.trade_date ?? "Today"}\n\n` +
        `Overall: ${bull ? "🟢 **Bullish**" : "🔴 **Bearish**"}\n\n` +
        `▲ Advancing: **${(d.advances ?? 0).toLocaleString("en-IN")}** stocks\n` +
        `▼ Declining: **${(d.declines ?? 0).toLocaleString("en-IN")}** stocks\n` +
        `→ Unchanged: **${(d.unchanged ?? 0).toLocaleString("en-IN")}** stocks\n` +
        `A/D Ratio: **${d.ratio ?? "—"}**\n` +
        `Total Tracked: **${(d.total ?? 0).toLocaleString("en-IN")}** stocks`;
    }

    case "rsi_oversold": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERSOLD&strength=STRONG&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch RSI signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No strongly oversold stocks (RSI < 30) found today. Market may be overbought overall.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — RSI: ${s.rsi?.toFixed(1) ?? "—"} | ₹${s.close.toFixed(2)} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct.toFixed(2)}%`
      ).join("\n");
      return `🎯 **RSI Oversold Stocks** (RSI < 30) — ${sigs.length} found\n\n${lines}\n\n*⚠️ Oversold ≠ automatic BUY signal. Always confirm with volume and trend.*`;
    }

    case "rsi_overbought": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERBOUGHT&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch RSI signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No overbought stocks (RSI > 70) found with strong signals today.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — RSI: ${s.rsi?.toFixed(1) ?? "—"} | ₹${s.close.toFixed(2)} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct.toFixed(2)}%`
      ).join("\n");
      return `⚠️ **RSI Overbought Stocks** (RSI > 70) — ${sigs.length} found\n\n${lines}\n\n*These stocks may face selling pressure.*`;
    }

    case "macd": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=MACD_BULL&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch MACD signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No MACD bullish crossovers found today.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — MACD: ${s.macd?.toFixed(3) ?? "—"} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct.toFixed(2)}%`
      ).join("\n");
      return `📈 **MACD Bullish Crossovers** — ${sigs.length} found\n\n${lines}\n\nMACD strategy: Buy when MACD line crosses above signal line.`;
    }

    case "sectors": {
      const r = await fetch(`${API}/api/v1/market/sector-performance`);
      if (!r.ok) return "⚠️ Could not fetch sector data.";
      const d: any[] = await r.json();
      if (!d.length) return "No sector data available.";
      const best = d[0]; const worst = d[d.length - 1];
      const lines = d.slice(0, 6).map((s, i) =>
        `${i + 1}. **${s.sector}** — ${s.avg_change_pct >= 0 ? "+" : ""}${s.avg_change_pct.toFixed(2)}% (${s.stock_count} stocks)`
      ).join("\n");
      return `🏭 **Sector Performance** — ${d.length} sectors\n\n${lines}\n\n` +
        `🥇 Best: **${best.sector}** (+${best.avg_change_pct.toFixed(2)}%)\n` +
        `🥺 Worst: **${worst.sector}** (${worst.avg_change_pct.toFixed(2)}%)`;
    }

    case "news": {
      const r = await fetch(`${API}/api/v1/news?limit=5`);
      if (!r.ok) return "⚠️ Could not fetch news right now.";
      const d = await r.json();
      const articles = d.articles ?? d ?? [];
      if (!articles.length) return "No news articles available. Check /news page for updates.";
      const lines = articles.slice(0, 5).map((a: any, i: number) =>
        `${i + 1}. **${a.title?.slice(0, 80) ?? "—"}**\n   Source: ${a.source ?? "—"} · ${a.published_at?.slice(0, 10) ?? ""}`
      ).join("\n\n");
      return `📰 **Latest Market News**\n\n${lines}\n\nVisit /news for full news feed.`;
    }

    case "help":
      return `🤖 **KP AI Assistant** — I can answer:\n\n` +
        `• **Any NSE stock:** "Status of RELIANCE", "Tell me INFY", "TCS"\n` +
        `• **Top movers:** "Top gainers today", "Worst losers"\n` +
        `• **RSI signals:** "Oversold stocks", "RSI < 30 stocks"\n` +
        `• **MACD signals:** "MACD bullish signals"\n` +
        `• **Market breadth:** "How is market today?"\n` +
        `• **Sectors:** "Best sector today"\n` +
        `• **News:** "Latest market news"\n\n` +
        `I use real NSE data from our PostgreSQL + yfinance pipeline. 📊`;

    default:
      return `🤔 I didn't understand that query.\n\n` +
        `Try:\n• "Status of RELIANCE"\n• "Top gainers today"\n• "Show oversold stocks"\n• "How is the market?"\n\nOr type a stock symbol directly like **TATAMOTORS** or **HDFCBANK**`;
  }
}

// ── Bubble component ─────────────────────────────────────────
function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const lines = msg.content.split("\n");
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row", marginBottom: 16 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isUser ? "var(--accent)" : "rgba(99,102,241,0.2)",
        border: `1px solid ${isUser ? "var(--accent)" : "rgba(99,102,241,0.4)"}` }}>
        {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="var(--accent-bright)" />}
      </div>
      <div style={{ maxWidth: "78%", padding: "12px 16px",
        background: isUser ? "var(--accent)" : "var(--surface-02)",
        border: isUser ? "none" : "1px solid var(--border)",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        color: isUser ? "#fff" : "var(--text-primary)", fontSize: "0.857rem", lineHeight: 1.7 }}>
        {lines.map((line, i) => {
          const html = line
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/📈|📉|🟢|🔴|⚪|💰|📊|🎯|⚠️|🏭|📰|🤖|🤔|📅|📐|✓|❌/g, m => m);
          return <div key={i} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
        })}
        <div style={{ fontSize: "0.643rem", marginTop: 6, opacity: 0.6 }}>
          {msg.ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function AssistantPage() {
  const [msgs,    setMsgs]    = useState<Msg[]>([{
    role: "assistant",
    content: `👋 **KP AI Assistant** here!\n\nI have access to real NSE market data:\n• **2,060+ stocks** — live prices & technicals\n• **RSI/MACD/SMA** signals computed from ohlcv_daily\n• **Market breadth** — advance/decline tracking\n• **Sector performance** — all NSE sectors\n\n**Try:** "Status of RELIANCE" · "Top gainers" · "Oversold stocks" · "Market breadth"`,
    ts: new Date(),
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text = input) => {
    const q = text.trim();
    if (!q || loading) return;
    setMsgs(prev => [...prev, { role: "user", content: q, ts: new Date() }]);
    setInput(""); setLoading(true);
    try {
      const intent  = detectIntent(q);
      const answer  = await respondToIntent(intent);
      setMsgs(prev => [...prev, { role: "assistant", content: answer, ts: new Date() }]);
    } catch (e: any) {
      setMsgs(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Error fetching data: ${e.message}. Please check backend is running.`,
        ts: new Date(),
      }]);
    } finally { setLoading(false); }
  }, [input, loading]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", height: "calc(100vh - 120px)",
      display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%",
          background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={18} color="var(--accent-bright)" />
        </div>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>KP AI Assistant</h1>
          <p style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
            Powered by real NSE OHLCV · RSI/MACD/SMA · Recognises any NSE symbol
          </p>
        </div>
        <div style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 20,
          background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
          fontSize: "0.714rem", color: "var(--color-up)", fontWeight: 600 }}>
          🟢 Live Data
        </div>
      </div>

      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "6px 12px", marginBottom: 10, flexShrink: 0,
        fontSize: "0.714rem", color: "var(--text-secondary)", display: "flex", gap: 6 }}>
        <AlertTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Educational tool only — not financial advice. Always do your own research before trading.
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {msgs.map((m, i) => <Bubble key={i} msg={m} />)}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%",
              background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={14} color="var(--accent-bright)" />
            </div>
            <div style={{ padding: "12px 16px", background: "var(--surface-02)",
              border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px",
              display: "flex", gap: 8, alignItems: "center" }}>
              <RefreshCw size={12} style={{ animation: "spin 1s linear infinite", color: "var(--accent-bright)" }} />
              <span style={{ fontSize: "0.857rem", color: "var(--text-tertiary)" }}>Fetching live NSE data…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, flexShrink: 0 }}>
        {SUGGESTIONS.slice(0, 6).map(s => (
          <button key={s} onClick={() => send(s)}
            style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.714rem",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder='Ask anything: "Status of RELIANCE" · "Top gainers" · "RSI signals"…'
          style={{ flex: 1, padding: "10px 16px", background: "var(--surface-02)",
            border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
            color: "var(--text-primary)", fontSize: "0.857rem", outline: "none" }} />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          style={{ width: 44, height: 44, borderRadius: "var(--border-radius)",
            background: input.trim() && !loading ? "var(--accent)" : "var(--surface-03)",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: input.trim() && !loading ? "pointer" : "not-allowed" }}>
          <Send size={16} color={input.trim() && !loading ? "#fff" : "var(--text-tertiary)"} />
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
