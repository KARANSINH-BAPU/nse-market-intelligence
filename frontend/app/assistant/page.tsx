"use client";
/**
 * KP — AI Assistant (Chat)
 * Conversational interface for market queries, powered by technical analysis data.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, User, Sparkles, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Msg { role: "user"|"assistant"; content: string; ts: Date; }

const SUGGESTIONS = [
  "What are today's top gainers?",
  "Show me oversold stocks (RSI < 30)",
  "Which sectors are performing best?",
  "Tell me about RELIANCE stock",
  "What is the market breadth today?",
  "Show MACD bullish crossovers",
];

async function queryMarket(question: string): Promise<string> {
  const q = question.toLowerCase();

  // Top gainers/losers
  if (q.includes("gainer") || q.includes("top performer") || q.includes("best stock")) {
    const r = await fetch(`${API}/api/v1/market/movers?limit=5`);
    if (r.ok) {
      const d = await r.json();
      const lines = d.gainers.map((g: any, i: number) =>
        `${i+1}. **${g.symbol}** — ₹${g.close.toFixed(2)} (+${g.change_pct}%)`
      ).join("\n");
      return `📈 **Top Gainers Today** (${d.trade_date})\n\n${lines}\n\nTotal stocks tracked: **${d.total_stocks}**`;
    }
  }
  if (q.includes("loser") || q.includes("worst") || q.includes("decline")) {
    const r = await fetch(`${API}/api/v1/market/movers?limit=5`);
    if (r.ok) {
      const d = await r.json();
      const lines = d.losers.map((g: any, i: number) =>
        `${i+1}. **${g.symbol}** — ₹${g.close.toFixed(2)} (${g.change_pct}%)`
      ).join("\n");
      return `📉 **Top Losers Today** (${d.trade_date})\n\n${lines}`;
    }
  }

  // Breadth
  if (q.includes("breadth") || q.includes("advance") || q.includes("market status") || q.includes("how is market")) {
    const r = await fetch(`${API}/api/v1/market/breadth`);
    if (r.ok) {
      const d = await r.json();
      const sent = d.advances > d.declines ? "🟢 **Bullish**" : "🔴 **Bearish**";
      return `📊 **Market Breadth** (${d.trade_date})\n\n` +
        `Sentiment: ${sent}\n` +
        `▲ Advancing: **${d.advances}** stocks\n` +
        `▼ Declining: **${d.declines}** stocks\n` +
        `A/D Ratio: **${d.ratio}**\n` +
        `Total: **${d.total}** stocks`;
    }
  }

  // RSI / oversold
  if (q.includes("oversold") || q.includes("rsi") || q.includes("buy signal")) {
    const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERSOLD&strength=STRONG&limit=8`);
    if (r.ok) {
      const d = await r.json();
      if (d.signals?.length) {
        const lines = d.signals.slice(0,5).map((s: any) =>
          `• **${s.symbol}** — RSI: ${s.rsi?.toFixed(1)} · ₹${s.close.toFixed(2)}`
        ).join("\n");
        return `🎯 **RSI Oversold Stocks** (RSI < 30)\n\n${lines}\n\n*These stocks may be oversold — NOT financial advice*`;
      }
    }
  }

  // MACD
  if (q.includes("macd") || q.includes("crossover") || q.includes("momentum")) {
    const r = await fetch(`${API}/api/v1/signals?signal_type=MACD_BULL&limit=8`);
    if (r.ok) {
      const d = await r.json();
      if (d.signals?.length) {
        const lines = d.signals.slice(0,5).map((s: any) =>
          `• **${s.symbol}** — MACD: ${s.macd?.toFixed(3)} · ${s.change_pct >= 0 ? "+" : ""}${s.change_pct.toFixed(2)}%`
        ).join("\n");
        return `📈 **MACD Bullish Crossovers**\n\n${lines}\n\n*Signals based on MACD(12,26,9)*`;
      }
    }
  }

  // Sector
  if (q.includes("sector") || q.includes("industry")) {
    const r = await fetch(`${API}/api/v1/market/sector-performance`);
    if (r.ok) {
      const d = await r.json();
      if (d.length) {
        const top = d[0]; const bot = d[d.length-1];
        return `🏭 **Sector Performance Today**\n\n` +
          `🥇 Best: **${top.sector}** → ${top.avg_change_pct}% (${top.stock_count} stocks)\n` +
          `🥺 Worst: **${bot.sector}** → ${bot.avg_change_pct}% (${bot.stock_count} stocks)\n` +
          `Total sectors: **${d.length}**`;
      }
    }
  }

  // Specific stock
  const stockMatch = question.match(/\b([A-Z]{2,12})\b/);
  if (stockMatch) {
    const sym = stockMatch[1];
    const r = await fetch(`${API}/api/v1/features/${sym}`);
    if (r.ok) {
      const d = await r.json();
      const rsi = d.rsi?.toFixed(1);
      const signals = (d.signals ?? []).map((s: any) => s.type).join(", ");
      return `📋 **${sym}** Analysis\n\n` +
        `Price: **₹${d.close?.toFixed(2)}**\n` +
        `Change: **${d.change_pct >= 0 ? "+" : ""}${d.change_pct?.toFixed(2)}%**\n` +
        `RSI(14): **${rsi ?? "—"}** ${Number(rsi) < 30 ? "🟢 Oversold" : Number(rsi) > 70 ? "🔴 Overbought" : "⚪ Neutral"}\n` +
        `MACD: **${d.macd?.toFixed(3) ?? "—"}**\n` +
        `SMA20: **₹${d.sma20?.toFixed(2) ?? "—"}**\n` +
        `Signals: **${signals || "None today"}**\n\n` +
        `*Technical analysis only — not financial advice*`;
    }
  }

  return `I can answer questions about:\n\n` +
    `• **Top gainers/losers** — "Show top gainers"\n` +
    `• **Market breadth** — "How is the market today?"\n` +
    `• **RSI signals** — "Show oversold stocks"\n` +
    `• **MACD signals** — "MACD bullish crossovers"\n` +
    `• **Any NSE stock** — "Tell me about RELIANCE"\n` +
    `• **Sectors** — "Which sector is best today?"\n\n` +
    `Try one of the suggestions below!`;
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row", marginBottom: 16 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isUser ? "var(--accent)" : "rgba(99,102,241,0.2)",
        border: `1px solid ${isUser ? "var(--accent)" : "rgba(99,102,241,0.4)"}` }}>
        {isUser ? <User size={14} color="#fff"/> : <Bot size={14} color="var(--accent-bright)"/>}
      </div>
      <div style={{ maxWidth: "75%", padding: "12px 16px",
        background: isUser ? "var(--accent)" : "var(--surface-02)",
        border: isUser ? "none" : "1px solid var(--border)",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        color: isUser ? "#fff" : "var(--text-primary)", fontSize: "0.857rem", lineHeight: 1.6 }}>
        {msg.content.split("\n").map((line, i) => {
          const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          return <div key={i} dangerouslySetInnerHTML={{ __html: bold || "&nbsp;" }} />;
        })}
        <div style={{ fontSize: "0.643rem", marginTop: 6, opacity: 0.6 }}>
          {msg.ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [msgs,    setMsgs]    = useState<Msg[]>([{
    role: "assistant",
    content: "👋 Hi! I'm **KP Assistant** — your AI market analyst.\n\nI have access to real NSE data:\n• 2,060+ stocks live prices\n• RSI/MACD/SMA signals\n• Market breadth & sentiment\n• Sector performance\n\nWhat would you like to know about the market today?",
    ts: new Date(),
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text = input) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text, ts: new Date() };
    setMsgs(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const answer = await queryMarket(text);
      setMsgs(prev => [...prev, { role: "assistant", content: answer, ts: new Date() }]);
    } finally { setLoading(false); }
  }, [input, loading]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", height: "calc(100vh - 120px)",
      display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
        flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%",
          background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={18} color="var(--accent-bright)" />
        </div>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>KP AI Assistant</h1>
          <p style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
            Powered by real NSE OHLCV data · RSI/MACD/SMA analysis
          </p>
        </div>
        <div style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 20,
          background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
          fontSize: "0.714rem", color: "var(--color-up)", fontWeight: 600 }}>
          🟢 Live Data
        </div>
      </div>

      <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "6px 12px", marginBottom: 10, flexShrink: 0,
        fontSize: "0.714rem", color: "var(--text-secondary)", display: "flex", gap: 6 }}>
        <AlertTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Educational tool only — not financial advice. Always do your own research.
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
              display: "flex", gap: 6, alignItems: "center" }}>
              <RefreshCw size={12} style={{ animation: "spin 1s linear infinite", color: "var(--accent-bright)" }} />
              <span style={{ fontSize: "0.857rem", color: "var(--text-tertiary)" }}>Analysing market data…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, flexShrink: 0 }}>
        {SUGGESTIONS.slice(0, 4).map(s => (
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
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about any NSE stock, sector, or market condition…"
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
