"use client";
/**
 * KP — AI Assistant (Smart Chat)
 * Handles ANY natural language query about NSE stocks, market, buy/sell advice.
 * Shows WHERE TO BUY / WHERE TO SELL with actual price levels.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, User, Sparkles, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCw, Target, ShieldAlert, X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Msg { role: "user" | "assistant"; content: string; ts: Date; }

const SUGGESTIONS = [
  "Should I buy RELIANCE?",
  "Top gainers today",
  "Best tech stocks",
  "Best bank stocks",
  "Where to buy TCS?",
  "Oversold stocks RSI < 30",
  "Compare INFY and WIPRO",
  "Market breadth today",
  "Best pharma stocks",
  "Momentum stocks",
  "Value stocks today",
  "Best stocks to buy",
];

// ── Broader intent detection ─────────────────────────────────────────────────
function detectIntent(q: string): { type: string; symbol?: string; symbol2?: string; extra?: string } {
  const t = q.trim().toUpperCase().replace(/['']/g, "'");

  // ── Compare two stocks ────────────────────────────────────────────────────
  const cmpMatch = t.match(/COMPARE\s+([A-Z0-9\-&]{2,15})\s+(?:AND|VS|VERSUS|WITH)\s+([A-Z0-9\-&]{2,15})/);
  if (cmpMatch) return { type: "compare", symbol: cmpMatch[1], symbol2: cmpMatch[2] };

  // ── Buy/Sell advice for a stock ───────────────────────────────────────────
  const buySellPatterns = [
    /(?:SHOULD\s+I\s+)?BUY\s+([A-Z0-9\-&]{2,15})/,
    /WHERE\s+TO\s+BUY\s+([A-Z0-9\-&]{2,15})/,
    /(?:IS\s+)?([A-Z0-9\-&]{2,15})\s+(?:A\s+)?(?:GOOD\s+)?BUY/,
    /([A-Z0-9\-&]{2,15})\s+BUY\s+(?:PRICE|LEVEL|TARGET)/,
    /ENTRY\s+(?:PRICE\s+)?(?:FOR\s+)?([A-Z0-9\-&]{2,15})/,
  ];
  for (const pat of buySellPatterns) {
    const m = t.match(pat);
    if (m) return { type: "buy_advice", symbol: m[1] };
  }

  const sellPatterns = [
    /(?:SHOULD\s+I\s+)?SELL\s+([A-Z0-9\-&]{2,15})/,
    /WHERE\s+TO\s+SELL\s+([A-Z0-9\-&]{2,15})/,
    /([A-Z0-9\-&]{2,15})\s+SELL\s+(?:PRICE|LEVEL|TARGET)/,
    /EXIT\s+(?:PRICE\s+)?(?:FOR\s+)?([A-Z0-9\-&]{2,15})/,
  ];
  for (const pat of sellPatterns) {
    const m = t.match(pat);
    if (m) return { type: "sell_advice", symbol: m[1] };
  }

  // ── Stock info patterns ───────────────────────────────────────────────────
  const stockPatterns = [
    /STATUS\s+OF\s+([A-Z0-9\-&]{2,15})/,
    /TELL\s+ME\s+(?:ABOUT\s+)?([A-Z0-9\-&]{2,15})/,
    /(?:SHOW|ANALYSE?|ANALYZE|RESEARCH|CHECK|GIVE\s+ME)\s+(?:ME\s+)?([A-Z0-9\-&]{2,15})/,
    /ABOUT\s+([A-Z0-9\-&]{2,15})/,
    /INFO(?:RMATION)?\s+(?:ON\s+|ABOUT\s+)?([A-Z0-9\-&]{2,15})/,
    /STOCK\s+([A-Z0-9\-&]{2,15})/,
    /PRICE\s+OF\s+([A-Z0-9\-&]{2,15})/,
    /(?:WHAT\s+IS\s+|WHAT'?S\s+)([A-Z0-9\-&]{2,15})(?:\s+(?:TRADING\s+AT|PRICE|RATE))?/,
    /(?:HOW\s+IS\s+)([A-Z0-9\-&]{2,15})(?:\s+DOING)?/,
  ];
  for (const pat of stockPatterns) {
    const m = t.match(pat);
    if (m) return { type: "stock", symbol: m[1] };
  }

  // ── Market/macro queries ──────────────────────────────────────────────────
  if (/BREADTH|HOW\s+IS\s+(?:THE\s+)?MARKET|ADVANCE|DECLINE|MARKET\s+(?:STATUS|TODAY|NOW|OVERVIEW)/.test(t))
    return { type: "breadth" };

  if (/TOP\s+GAIN|BEST\s+(?:STOCK|PERFORM|GAIN)|GAINER|RISING|BIG\s+MOVE/.test(t))
    return { type: "gainers" };

  if (/TOP\s+LOS|WORST|DECLIN|FALLING|DOWN\s+STOCK/.test(t))
    return { type: "losers" };

  if (/OVERSOLD|RSI\s*[<＜]\s*30|BUY\s+SIGNAL|UNDERVALUED/.test(t))
    return { type: "rsi_oversold" };

  if (/OVERBOUGHT|RSI\s*[>＞]\s*70|SELL\s+SIGNAL|OVERVALUED/.test(t))
    return { type: "rsi_overbought" };

  if (/MACD|CROSS[OV]+|MOMENTUM/.test(t))
    return { type: "macd" };

  if (/SECTOR|INDUSTRY|SEGMENT/.test(t))
    return { type: "sectors" };

  if (/NEWS|LATEST|UPDATE|HEADLINE/.test(t))
    return { type: "news" };

  if (/HELP|WHAT\s+CAN|WHAT\s+DO|COMMANDS|FEATURES/.test(t))
    return { type: "help" };

  // ── Multi-category queries (ONLY if no symbol detected yet) ──────────────
  if (/BEST\s+(?:AI|TECH|IT)\s+STOCKS?|TOP\s+(?:AI|TECH|IT)\s+STOCKS?/.test(t))
    return { type: "best_tech" };

  if (/BEST\s+(?:PHARMA|HEALTH)\s+STOCKS?|TOP\s+(?:PHARMA|HEALTH)\s+STOCKS?/.test(t))
    return { type: "best_pharma" };

  if (/BEST\s+(?:BANK|BANKING)\s+STOCKS?|TOP\s+(?:BANK|BANKING)\s+STOCKS?/.test(t))
    return { type: "best_bank" };

  if (/MOMENTUM\s+STOCKS?|HIGH\s+MOMENTUM/.test(t))
    return { type: "momentum" };

  if (/VALUE\s+STOCKS?|UNDERVALUED/.test(t))
    return { type: "value_stocks" };

  if (/BEST\s+STOCKS?|TOP\s+STOCKS?|WHICH\s+STOCKS?\s+TO\s+BUY/.test(t))
    return { type: "best_stocks" };

  if (/NIFTY|INDEX|MARKET\s+INDEX/.test(t))
    return { type: "breadth" };

  // ── Bare NSE symbol — ONLY for single-word queries ────────────────────────
  // Must have no spaces in original query to avoid multi-word mismatches
  const hasSpaces = q.trim().includes(" ");
  if (!hasSpaces) {
    const bare = t.trim().replace(/[^A-Z0-9\-&]/g, "");
    if (bare.length >= 2 && bare.length <= 15 && /^[A-Z]/.test(bare) &&
        !["THE", "AND", "FOR", "BUY", "SELL", "NSE", "BSE", "TOP", "ALL",
          "HOW", "WHAT", "GIVE", "SHOW", "HELP", "NEWS", "BEST"].includes(bare))
      return { type: "stock", symbol: bare };
  }

  return { type: "unknown", extra: q };
}

// ── Full stock analysis ──────────────────────────────────────────────────────
async function stockAnalysis(sym: string) {
  const [searchRes, ohlcvRes, signalRes] = await Promise.allSettled([
    fetch(`${API}/api/v1/market/search?q=${sym}&limit=1`).then(r => r.ok ? r.json() : null),
    fetch(`${API}/api/v1/ohlcv/${sym}?period=3m`).then(r => r.ok ? r.json() : null),
    fetch(`${API}/api/v1/signals/${sym}`).then(r => r.ok ? r.json() : null),
  ]);

  const sr  = searchRes.status === "fulfilled" ? searchRes.value : null;
  const or  = ohlcvRes.status  === "fulfilled" ? ohlcvRes.value  : null;
  const sig = signalRes.status === "fulfilled" ? signalRes.value : null;

  const stockInfo = sr?.results?.[0] ?? null;
  const bars      = or?.bars ?? [];
  const latest    = bars[bars.length - 1] ?? null;
  const prev5     = bars[bars.length - 6] ?? null;

  const price    = latest?.close ?? stockInfo?.close;
  const changePct = latest?.change_pct ?? stockInfo?.change_pct;
  const rsi      = sig?.rsi ?? latest?.rsi;
  const macd     = sig?.macd ?? latest?.macd;
  const macdHist = latest?.macd_hist;
  const sma20    = sig?.sma20 ?? latest?.sma20;
  const ema12    = latest?.ema12;
  const high1M   = bars.length ? Math.max(...bars.map((b: any) => b.high)) : null;
  const low1M    = bars.length ? Math.min(...bars.map((b: any) => b.low))  : null;
  const sigs     = sig?.signals ?? [];

  return { price, changePct, rsi, macd, macdHist, sma20, ema12, high1M, low1M, sigs, stockInfo, bars, prev5, sig };
}

// ── Compute buy/sell levels ──────────────────────────────────────────────────
function computeLevels(price: number, sma20: number | null, high1M: number | null, low1M: number | null, action: "BUY" | "SELL") {
  const support    = sma20 ?? (low1M ? (price + low1M) / 2 : price * 0.97);
  const resistance = high1M ?? price * 1.07;
  if (action === "BUY") {
    return {
      entryZone:  `₹${(support * 0.995).toFixed(2)} – ₹${(support * 1.005).toFixed(2)}`,
      target1:    `₹${(price * 1.05).toFixed(2)} (+5%)`,
      target2:    `₹${(price * 1.10).toFixed(2)} (+10%)`,
      stopLoss:   `₹${(support * 0.963).toFixed(2)} (-3.7% below support)`,
      riskReward: "1:1.5 (approx)",
    };
  } else {
    return {
      exitZone:   `₹${(resistance * 0.998).toFixed(2)} – ₹${resistance.toFixed(2)}`,
      target1:    `₹${(price * 0.95).toFixed(2)} (-5%)`,
      target2:    `₹${(price * 0.90).toFixed(2)} (-10%)`,
      stopLoss:   `₹${(resistance * 1.03).toFixed(2)} (+3% above resistance)`,
    };
  }
}

// ── Generate AI responses ────────────────────────────────────────────────────
async function respondToIntent(intent: ReturnType<typeof detectIntent>): Promise<string> {
  switch (intent.type) {

    // ── Stock full analysis ────────────────────────────────────────────────
    case "stock":
    case "buy_advice":
    case "sell_advice": {
      const sym = intent.symbol!;
      const { price, changePct, rsi, macd, macdHist, sma20, ema12, high1M, low1M, sigs, stockInfo, bars, prev5 } =
        await stockAnalysis(sym);

      if (!price) {
        return `❌ **${sym}** — No data found.\n\nTip: Use exact NSE symbol like **RELIANCE** · **TCS** · **INFY** · **SBIN** · **HDFCBANK**`;
      }

      // Score signals
      let buyScore = 0, sellScore = 0;
      const signalLines: string[] = [];

      if (rsi != null) {
        if (rsi < 25)      { signalLines.push("🟢 RSI deeply oversold (<25) — Strong reversal potential"); buyScore += 2; }
        else if (rsi < 35) { signalLines.push("🟢 RSI oversold (<35) — Potential buying opportunity"); buyScore += 1; }
        else if (rsi > 75) { signalLines.push("🔴 RSI deeply overbought (>75) — Strong pullback risk"); sellScore += 2; }
        else if (rsi > 65) { signalLines.push("🔴 RSI overbought (>65) — Caution, may face selling"); sellScore += 1; }
        else if (rsi > 45 && rsi < 55) { signalLines.push("⚪ RSI neutral (45-55) — No strong directional bias"); }
        else if (rsi >= 40) { signalLines.push("🟡 RSI recovering — Momentum building"); buyScore += 0.5; }
      }
      if (macd != null && macdHist != null) {
        if (macd > 0 && macdHist > 0)  { signalLines.push("🟢 MACD bullish — Histogram positive, upward momentum"); buyScore += 1; }
        else if (macd > 0 && macdHist < 0) { signalLines.push("🟡 MACD weakening — Bullish but losing momentum"); }
        else if (macd < 0 && macdHist < 0) { signalLines.push("🔴 MACD bearish — Selling pressure continues"); sellScore += 1; }
        else if (macd < 0 && macdHist > 0) { signalLines.push("🟡 MACD recovering — Bearish but improving"); buyScore += 0.5; }
      }
      if (sma20 && price) {
        const pctVsSma = ((price - sma20) / sma20) * 100;
        if (price > sma20) { signalLines.push(`🟢 Price above SMA20 (+${pctVsSma.toFixed(1)}%) — Uptrend confirmed`); buyScore += 1; }
        else               { signalLines.push(`🔴 Price below SMA20 (${pctVsSma.toFixed(1)}%) — Downtrend, caution`); sellScore += 1; }
      }
      if (ema12 && sma20) {
        if (ema12 > sma20) { signalLines.push("🟢 EMA12 > SMA20 — Golden momentum"); buyScore += 0.5; }
        else               { signalLines.push("🔴 EMA12 < SMA20 — Death cross"); sellScore += 0.5; }
      }
      if (prev5 && price) {
        const trend5d = ((price - prev5.close) / prev5.close) * 100;
        if (trend5d > 3)       { signalLines.push(`📈 Strong 5-day momentum: +${trend5d.toFixed(1)}%`); buyScore += 0.5; }
        else if (trend5d < -3) { signalLines.push(`📉 Weak 5-day momentum: ${trend5d.toFixed(1)}%`); sellScore += 0.5; }
      }

      const totalScore = buyScore - sellScore;
      let action: string, emoji: string, confidence: string, timeHorizon: string, recommendation: string;

      if (totalScore >= 2.5)      { action = "STRONG BUY";   emoji = "🚀"; confidence = "High";          timeHorizon = "1–4 weeks"; recommendation = "Multiple strong bullish indicators aligned. Consider buying on dips near SMA20."; }
      else if (totalScore >= 1.5) { action = "BUY";          emoji = "✅"; confidence = "Moderate-High"; timeHorizon = "2–6 weeks"; recommendation = "More bullish signals than bearish. Good entry if conditions hold."; }
      else if (totalScore >= 0.5) { action = "CAUTIOUS BUY"; emoji = "🟡"; confidence = "Moderate";      timeHorizon = "4–8 weeks"; recommendation = "Slightly bullish but mixed signals. Wait for RSI confirmation."; }
      else if (totalScore > -0.5) { action = "HOLD";         emoji = "⏳"; confidence = "Neutral";       timeHorizon = "Review in 1–2 weeks"; recommendation = "Mixed signals — no clear direction. Wait for clarity."; }
      else if (totalScore > -1.5) { action = "CAUTIOUS SELL"; emoji = "⚠️"; confidence = "Moderate";    timeHorizon = "Exit in 1–2 weeks"; recommendation = "More bearish than bullish. Consider reducing position."; }
      else                        { action = "SELL / AVOID"; emoji = "🔴"; confidence = "High";          timeHorizon = "Avoid 2–4 weeks"; recommendation = "Multiple bearish indicators. Existing holders consider exiting."; }

      // Override based on explicit intent
      const isBuyQuery  = intent.type === "buy_advice";
      const isSellQuery = intent.type === "sell_advice";
      const showBuyLevels  = isBuyQuery  || totalScore >= 0.5;
      const showSellLevels = isSellQuery || totalScore <= -0.5;

      const levels = computeLevels(price, sma20, high1M, low1M, showSellLevels ? "SELL" : "BUY");

      let out = `📊 **${sym}${stockInfo?.name ? ` — ${stockInfo.name}` : ""}**\n\n`;
      out += `💰 **LTP:** ₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      out += changePct != null ? `   |   ${changePct >= 0 ? "▲ +" : "▼ "}${Math.abs(changePct).toFixed(2)}%\n\n` : "\n\n";

      out += `${"─".repeat(40)}\n`;
      out += `${emoji} **AI RECOMMENDATION: ${action}**\n`;
      out += `⏱ **Time Horizon:** ${timeHorizon}\n`;
      out += `📈 **Confidence:** ${confidence}\n`;
      out += `💡 ${recommendation}\n`;
      out += `${"─".repeat(40)}\n\n`;

      // Price Levels
      if (showBuyLevels && !showSellLevels) {
        out += `🎯 **WHERE TO BUY (Entry Levels):**\n`;
        out += `• **Entry Zone:** ${(levels as any).entryZone}\n`;
        out += `• **Target 1:** ${(levels as any).target1}\n`;
        out += `• **Target 2:** ${(levels as any).target2}\n`;
        out += `• **Stop Loss:** ${(levels as any).stopLoss}\n\n`;
      }
      if (showSellLevels) {
        out += `🎯 **WHERE TO SELL (Exit Levels):**\n`;
        out += `• **Exit Zone:** ${(levels as any).exitZone}\n`;
        out += `• **Target 1 (short):** ${(levels as any).target1}\n`;
        out += `• **Target 2 (short):** ${(levels as any).target2}\n`;
        out += `• **Stop Loss (for short):** ${(levels as any).stopLoss}\n\n`;
      }

      out += `🔍 **Signal Analysis:**\n${signalLines.map(s => `• ${s}`).join("\n")}\n\n`;
      out += `📉 **Technical Values:**\n`;
      out += `• RSI(14): **${rsi?.toFixed(1) ?? "—"}**\n`;
      out += `• MACD: **${macd?.toFixed(3) ?? "—"}**\n`;
      out += `• SMA(20): **${sma20 != null ? `₹${sma20.toFixed(2)}` : "—"}**\n`;
      out += `• EMA(12): **${ema12 != null ? `₹${ema12.toFixed(2)}` : "—"}**\n`;
      if (high1M) out += `• 3-Month Range: ₹${low1M!.toFixed(2)} – ₹${high1M.toFixed(2)}\n`;
      out += `• Data: ${bars.length} bars\n\n`;
      out += `⚠️ *Technical analysis for educational purposes only — NOT financial advice.*`;
      return out;
    }

    // ── Compare two stocks ─────────────────────────────────────────────────
    case "compare": {
      const [a1, a2] = await Promise.all([
        stockAnalysis(intent.symbol!),
        stockAnalysis(intent.symbol2!),
      ]);
      const s1 = intent.symbol!, s2 = intent.symbol2!;
      if (!a1.price && !a2.price) return `❌ No data found for **${s1}** or **${s2}**.`;

      const r1 = a1.rsi, r2 = a2.rsi;
      const winner = (r1 != null && r2 != null)
        ? (Math.abs(r1 - 50) < Math.abs(r2 - 50) ? s1 : s2)
        : "N/A";

      return `📊 **Comparison: ${s1} vs ${s2}**\n\n` +
        `| Metric | ${s1} | ${s2} |\n` +
        `|--------|-------|-------|\n` +
        `| **LTP ₹** | ${a1.price ? `₹${a1.price.toFixed(2)}` : "—"} | ${a2.price ? `₹${a2.price.toFixed(2)}` : "—"} |\n` +
        `| **Change %** | ${a1.changePct != null ? `${a1.changePct >= 0 ? "+" : ""}${a1.changePct.toFixed(2)}%` : "—"} | ${a2.changePct != null ? `${a2.changePct >= 0 ? "+" : ""}${a2.changePct.toFixed(2)}%` : "—"} |\n` +
        `| **RSI(14)** | ${r1?.toFixed(1) ?? "—"} | ${r2?.toFixed(1) ?? "—"} |\n` +
        `| **MACD** | ${a1.macd?.toFixed(3) ?? "—"} | ${a2.macd?.toFixed(3) ?? "—"} |\n` +
        `| **SMA20 ₹** | ${a1.sma20 ? `₹${a1.sma20.toFixed(2)}` : "—"} | ${a2.sma20 ? `₹${a2.sma20.toFixed(2)}` : "—"} |\n` +
        `| **Signals** | ${a1.sigs.length} | ${a2.sigs.length} |\n\n` +
        `🏆 **More neutral RSI (closer to 50):** ${winner}\n\n` +
        `⚠️ *Technical comparison only — NOT financial advice.*`;
    }

    // ── Gainers ────────────────────────────────────────────────────────────
    case "gainers": {
      const r = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=8`);
      if (!r.ok) return "⚠️ Could not fetch gainers data right now.";
      const d = await r.json();
      const lines = (d.gainers ?? []).slice(0, 8).map((g: any, i: number) =>
        `${i + 1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2) ?? "—"} | **+${g.change_pct?.toFixed(2)}%** 📈`
      ).join("\n");
      const live = d.live ? "🟢 Live" : "🟡 EOD";
      return `📈 **Top Gainers Today** (NIFTY 50 · ${d.as_of ?? "latest"} · ${live})\n\n${lines}\n\n` +
        `*Visit Markets page for full NSE-style table with Open/High/Low/Value data*`;
    }

    // ── Losers ─────────────────────────────────────────────────────────────
    case "losers": {
      const r = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=8`);
      if (!r.ok) return "⚠️ Could not fetch losers data right now.";
      const d = await r.json();
      const lines = (d.losers ?? []).slice(0, 8).map((g: any, i: number) =>
        `${i + 1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2) ?? "—"} | **${g.change_pct?.toFixed(2)}%** 📉`
      ).join("\n");
      return `📉 **Top Losers Today** (NIFTY 50 · ${d.as_of ?? "latest"})\n\n${lines}`;
    }

    // ── Market breadth ─────────────────────────────────────────────────────
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

    // ── RSI Oversold ──────────────────────────────────────────────────────
    case "rsi_oversold": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERSOLD&strength=STRONG&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch RSI signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No strongly oversold stocks (RSI < 30) found today.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — RSI: **${s.rsi?.toFixed(1) ?? "—"}** | ₹${s.close?.toFixed(2)} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct?.toFixed(2)}%` +
        (s.buy_price ? ` | 🎯 Buy At: ₹${s.buy_price}` : "")
      ).join("\n");
      return `🎯 **RSI Oversold Stocks** (RSI < 30) — ${sigs.length} found\n\n${lines}\n\n*⚠️ Oversold ≠ automatic BUY. Confirm with volume and trend. Visit Predictions page for full table.*`;
    }

    // ── RSI Overbought ────────────────────────────────────────────────────
    case "rsi_overbought": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERBOUGHT&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch RSI signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No overbought stocks (RSI > 70) found today.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — RSI: **${s.rsi?.toFixed(1) ?? "—"}** | ₹${s.close?.toFixed(2)}` +
        (s.sell_price ? ` | 🔴 Sell At: ₹${s.sell_price}` : "")
      ).join("\n");
      return `⚠️ **RSI Overbought Stocks** (RSI > 70) — ${sigs.length} found\n\n${lines}\n\n*These stocks may face selling pressure.*`;
    }

    // ── MACD ──────────────────────────────────────────────────────────────
    case "macd": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=MACD_BULL&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch MACD signals.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No MACD bullish crossovers found today.";
      const lines = sigs.slice(0, 8).map((s: any) =>
        `• **${s.symbol}** — MACD: ${s.macd?.toFixed(3) ?? "—"} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct?.toFixed(2)}%` +
        (s.buy_price ? ` | 🎯 Buy At: ₹${s.buy_price}` : "")
      ).join("\n");
      return `📈 **MACD Bullish Crossovers** — ${sigs.length} found\n\n${lines}\n\nMACDstrategy: Buy when MACD line crosses above signal line.`;
    }

    // ── Sectors ───────────────────────────────────────────────────────────
    case "sectors": {
      const r = await fetch(`${API}/api/v1/market/sector-performance`);
      if (!r.ok) return "⚠️ Could not fetch sector data.";
      const d: any[] = await r.json();
      if (!d.length) return "No sector data available.";
      const best = d[0]; const worst = d[d.length - 1];
      const lines = d.slice(0, 6).map((s, i) =>
        `${i + 1}. **${s.sector}** — ${s.avg_change_pct >= 0 ? "+" : ""}${s.avg_change_pct?.toFixed(2)}% (${s.stock_count} stocks)`
      ).join("\n");
      return `🏭 **Sector Performance** — ${d.length} sectors\n\n${lines}\n\n` +
        `🥇 Best: **${best.sector}** (+${best.avg_change_pct?.toFixed(2)}%)\n` +
        `🥺 Worst: **${worst.sector}** (${worst.avg_change_pct?.toFixed(2)}%)`;
    }

    // ── News ──────────────────────────────────────────────────────────────
    case "news": {
      const r = await fetch(`${API}/api/v1/news?limit=5`);
      if (!r.ok) return "⚠️ Visit /news page for the live news feed.";
      const d = await r.json();
      const articles = d.news ?? d.articles ?? [];
      if (!articles.length) return "📰 No news articles available right now. Visit /news for the full live news feed.";
      const lines = articles.slice(0, 5).map((a: any, i: number) =>
        `${i + 1}. **${a.title?.slice(0, 90) ?? "—"}**\n   ${a.source ?? ""} · ${a.published?.slice(0, 10) ?? ""}`
      ).join("\n\n");
      return `📰 **Latest Market News**\n\n${lines}\n\nFull news feed → **/news page**`;
    }

    // ── Help ──────────────────────────────────────────────────────────────
    case "help":
      return `🤖 **KP AI Assistant** — Ask me anything!\n\n` +
        `**📈 Stock Analysis:**\n` +
        `• "Status of RELIANCE", "TCS", "How is INFY?"\n` +
        `• "What is HDFCBANK trading at?"\n\n` +
        `**💰 Buy/Sell Advice:**\n` +
        `• "Should I buy RELIANCE?"\n` +
        `• "Where to buy TCS?" — shows entry zone, targets, stop-loss\n` +
        `• "Where to sell BHARTIARTL?"\n\n` +
        `**⚖️ Compare Stocks:**\n` +
        `• "Compare INFY and TCS"\n` +
        `• "RELIANCE vs ONGC"\n\n` +
        `**📊 Market Overview:**\n` +
        `• "Top gainers today", "Market breadth", "Best sector"\n` +
        `• "Oversold stocks RSI < 30", "MACD bullish signals"\n\n` +
        `I use real NSE data — RSI/MACD/SMA from OHLCV history. 📊\n` +
        `⚠️ *Educational only — not financial advice.*`;

    // ── Best Tech / AI Stocks ─────────────────────────────────────────────
    case "best_tech": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=SMA_BULL&limit=50`);
      if (!r.ok) return "⚠️ Could not fetch data.";
      const d = await r.json();
      const IT_SYMS = ["TCS", "INFOSYS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTIM", "MPHASIS", "COFORGE", "PERSISTENT"];
      const sigs = (d.signals ?? []).filter((s: any) => IT_SYMS.includes(s.symbol)).slice(0, 8);
      const r2 = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=50`);
      const d2 = r2.ok ? await r2.json() : null;
      const itGainers = (d2?.gainers ?? []).filter((g: any) => IT_SYMS.includes(g.symbol));

      let out = `💻 **Best Tech / IT Stocks Today**\n\n`;
      if (itGainers.length) {
        out += `📈 **Today's Top IT Gainers (Nifty 50):**\n`;
        itGainers.slice(0, 5).forEach((g: any, i: number) => {
          out += `${i+1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2)} | +${g.change_pct?.toFixed(2)}%`;
          if (g.buy_price) out += ` | 🎯 Buy At: ₹${g.buy_price}`;
          out += "\n";
        });
        out += "\n";
      }
      if (sigs.length) {
        out += `✅ **IT Stocks in Uptrend (Above SMA20):**\n`;
        sigs.forEach((s: any) => { out += `• **${s.symbol}** — ₹${s.close?.toFixed(2)} | +${s.change_pct?.toFixed(2)}%\n`; });
        out += "\n";
      }
      out += `📊 Key NSE IT stocks: TCS · INFY · HCLTECH · WIPRO · TECHM\n`;
      out += `⚠️ *Technical signals only — not financial advice.*`;
      return out;
    }

    // ── Best Pharma Stocks ────────────────────────────────────────────────
    case "best_pharma": {
      const PHARMA = ["SUNPHARMA", "DRREDDY", "DIVISLAB", "CIPLA", "APOLLOHOSP", "AUROPHARMA", "LUPIN", "BIOCON"];
      const r = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=50`);
      const d = r.ok ? await r.json() : null;
      const pharmaG = (d?.gainers ?? []).filter((g: any) => PHARMA.includes(g.symbol));
      let out = `💊 **Best Pharma / Healthcare Stocks Today**\n\n`;
      if (pharmaG.length) {
        pharmaG.slice(0, 6).forEach((g: any, i: number) => {
          out += `${i+1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2)} | ${g.change_pct >= 0 ? "+" : ""}${g.change_pct?.toFixed(2)}%\n`;
        });
      } else {
        out += `Key Pharma stocks to track: **SUNPHARMA · DRREDDY · DIVISLAB · CIPLA · APOLLOHOSP**\n`;
        out += `Ask me about any specific pharma stock: "Should I buy SUNPHARMA?"\n`;
      }
      out += `\n⚠️ *Educational only — not financial advice.*`;
      return out;
    }

    // ── Best Bank Stocks ──────────────────────────────────────────────────
    case "best_bank": {
      const BANKS = ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BANDHANBNK", "IDFCFIRSTB"];
      const r = await fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=50`);
      const d = r.ok ? await r.json() : null;
      const bankG = [...(d?.gainers ?? []), ...(d?.losers ?? [])]
        .filter((g: any) => BANKS.includes(g.symbol))
        .sort((a: any, b: any) => b.change_pct - a.change_pct);
      let out = `🏦 **Banking & Financial Stocks Today**\n\n`;
      if (bankG.length) {
        bankG.slice(0, 6).forEach((g: any, i: number) => {
          const up = g.change_pct >= 0;
          out += `${i+1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2)} | ${up ? "+" : ""}${g.change_pct?.toFixed(2)}% ${up ? "📈" : "📉"}\n`;
        });
      } else {
        out += `Key Banking stocks: **HDFCBANK · ICICIBANK · SBIN · KOTAKBANK · AXISBANK**\n`;
        out += `Ask me: "Should I buy HDFCBANK?" for detailed analysis\n`;
      }
      out += `\n⚠️ *Educational only — not financial advice.*`;
      return out;
    }

    // ── Momentum Stocks ───────────────────────────────────────────────────
    case "momentum": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=MACD_BULL&strength=STRONG&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch momentum data.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No strong momentum stocks found today.";
      const lines = sigs.slice(0, 8).map((s: any, i: number) =>
        `${i+1}. **${s.symbol}** — MACD: ${s.macd?.toFixed(3)} | ₹${s.close?.toFixed(2)} | ${s.change_pct >= 0 ? "+" : ""}${s.change_pct?.toFixed(2)}%` +
        (s.buy_price ? ` | 🎯 ₹${s.buy_price}` : "")
      ).join("\n");
      return `🚀 **High Momentum Stocks** (MACD Bullish, Strong) — ${sigs.length} found\n\n${lines}\n\n*Momentum = MACD above signal line with positive histogram*\n⚠️ *Not financial advice.*`;
    }

    // ── Value Stocks ──────────────────────────────────────────────────────
    case "value_stocks": {
      const r = await fetch(`${API}/api/v1/signals?signal_type=RSI_OVERSOLD&limit=10`);
      if (!r.ok) return "⚠️ Could not fetch value stocks.";
      const d = await r.json();
      const sigs = d.signals ?? [];
      if (!sigs.length) return "No oversold/value stocks found today.";
      const lines = sigs.slice(0, 8).map((s: any, i: number) =>
        `${i+1}. **${s.symbol}** — RSI: **${s.rsi?.toFixed(1)}** | ₹${s.close?.toFixed(2)}` +
        (s.buy_price ? ` | 🎯 Buy At: ₹${s.buy_price}` : "")
      ).join("\n");
      return `💎 **Potentially Undervalued Stocks** (RSI < 30, technically oversold)\n\n${lines}\n\n*Low RSI = oversold = potential value entry. Always check fundamentals too.*\n⚠️ *Not financial advice.*`;
    }

    // ── Best Stocks (general) ─────────────────────────────────────────────
    case "best_stocks": {
      const [glRes, sigRes] = await Promise.allSettled([
        fetch(`${API}/api/v1/market/gainers-losers?index=NIFTY50&limit=20`).then(r => r.json()),
        fetch(`${API}/api/v1/signals?signal_type=RSI_OVERSOLD&strength=STRONG&limit=5`).then(r => r.json()),
      ]);
      const gl  = glRes.status  === "fulfilled" ? glRes.value  : null;
      const sig = sigRes.status === "fulfilled" ? sigRes.value : null;
      const topGainers = (gl?.gainers ?? []).slice(0, 5);
      const oversold   = (sig?.signals ?? []).slice(0, 3);
      let out = `🏆 **Best Stocks Right Now** (based on technical signals)\n\n`;
      if (topGainers.length) {
        out += `📈 **Top Nifty 50 Gainers Today:**\n`;
        topGainers.forEach((g: any, i: number) => {
          out += `${i+1}. **${g.symbol}** — ₹${g.ltp?.toFixed(2)} | +${g.change_pct?.toFixed(2)}%\n`;
        });
        out += "\n";
      }
      if (oversold.length) {
        out += `🎯 **Oversold Stocks (RSI < 30 — Potential Bounce):**\n`;
        oversold.forEach((s: any) => {
          out += `• **${s.symbol}** — RSI: ${s.rsi?.toFixed(1)} | ₹${s.close?.toFixed(2)}`;
          if (s.buy_price) out += ` | Buy At: ₹${s.buy_price}`;
          out += "\n";
        });
        out += "\n";
      }
      out += `💡 **Ask me for detailed analysis:**\n`;
      out += `• "Should I buy [SYMBOL]?" for buy/sell levels\n`;
      out += `• "Best tech stocks" · "Best bank stocks" · "Best pharma stocks"\n`;
      out += `• "MACD bullish signals" · "Oversold stocks RSI < 30"\n\n`;
      out += `⚠️ *Technical signals only — not financial advice.*`;
      return out;
    }

    default: {
      // Try to extract any symbol from the unknown query as last resort
      const words = intent.extra?.toUpperCase().split(/\s+/) ?? [];
      const possibleSym = words.find(w =>
        w.length >= 2 && w.length <= 12 && /^[A-Z][A-Z0-9]+$/.test(w) &&
        !["THE","AND","FOR","WITH","FROM","WHAT","WHICH","BEST","SHOW","GIVE",
          "TELL","FIND","LIST","GET","ARE","TOP","ALL","HOW","IS","IN","OF",
          "NSE","BSE","STOCKS","STOCK","MARKET","TODAY","GOOD","BUY","SELL"].includes(w)
      );
      if (possibleSym) {
        // Re-run as stock analysis
        const { price, changePct, rsi, sma20 } = await stockAnalysis(possibleSym);
        if (price) {
          return await respondToIntent({ type: "stock", symbol: possibleSym });
        }
      }
      return `🤔 I didn't quite understand that. Here's what I can help with:\n\n` +
        `**📈 Stock Analysis & Advice:**\n` +
        `• "Should I buy RELIANCE?" — full analysis + where to buy/sell\n` +
        `• "Where to buy TCS?" — entry price, target, stop-loss\n` +
        `• Type any NSE symbol: **TATAMOTORS** · **HDFCBANK** · **INFY**\n\n` +
        `**📊 Market Queries:**\n` +
        `• "Top gainers today" · "Top losers" · "Market breadth"\n` +
        `• "Best tech stocks" · "Best bank stocks" · "Best pharma stocks"\n` +
        `• "Oversold stocks" · "MACD bullish signals" · "Momentum stocks"\n\n` +
        `**⚖️ Compare:** "Compare TCS and INFY"\n\n` +
        `Type **"help"** for the full guide.`;
    }
  }
}

// ── Bubble component ─────────────────────────────────────────────────────────
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
      <div style={{ maxWidth: "82%", padding: "12px 16px",
        background: isUser ? "var(--accent)" : "var(--surface-02)",
        border: isUser ? "none" : "1px solid var(--border)",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        color: isUser ? "#fff" : "var(--text-primary)", fontSize: "0.857rem", lineHeight: 1.75 }}>
        {lines.map((line, i) => {
          // Render markdown table rows
          if (line.startsWith("|")) {
            return (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.786rem",
                whiteSpace: "pre", borderBottom: "1px solid var(--border)", padding: "2px 0" }}
                dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
            );
          }
          // Separator line
          if (/^─+$/.test(line)) {
            return <hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
          }
          const html = line
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>");
          return <div key={i} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
        })}
        <div style={{ fontSize: "0.643rem", marginTop: 6, opacity: 0.6 }}>
          {msg.ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "assistant",
    content: `👋 **KP AI Assistant** here!\n\nI have access to real NSE market data. Ask me anything!\n\n**💰 Buy/Sell Advice:**\n• "Should I buy RELIANCE?" — entry zone, target, stop-loss\n• "Where to buy TCS?" · "Where to sell BHARTIARTL?"\n\n**📊 Stock Analysis:** Any NSE symbol — "HDFCBANK", "INFY"\n\n**📈 Market & Sectors:**\n• "Top gainers today" · "Top losers" · "Market breadth"\n• "Best tech stocks" · "Best bank stocks" · "Best pharma stocks"\n• "Momentum stocks" · "Value stocks" · "Oversold stocks"\n\n**⚖️ Compare:** "Compare TCS and INFY"\n\nType **"help"** for the full guide!`,
    ts: new Date(),
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text = input) => {
    const q = text.trim();
    if (!q || loading) return;
    setMsgs(prev => [...prev, { role: "user", content: q, ts: new Date() }]);
    setInput(""); setLoading(true);
    try {
      const intent = detectIntent(q);
      const answer = await respondToIntent(intent);
      setMsgs(prev => [...prev, { role: "assistant", content: answer, ts: new Date() }]);
    } catch (e: any) {
      setMsgs(prev => [...prev, {
        role: "assistant",
        content: `⚠️ Error: ${e.message}. Please check backend is running at ${API}`,
        ts: new Date(),
      }]);
    } finally { setLoading(false); inputRef.current?.focus(); }
  }, [input, loading]);

  const clearChat = () => setMsgs(prev => [prev[0]]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", height: "calc(100vh - 120px)",
      display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%",
          background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={18} color="var(--accent-bright)" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>KP AI Assistant</h1>
          <p style={{ fontSize: "0.714rem", color: "var(--text-tertiary)" }}>
            Ask anything — stocks · buy/sell levels · comparison · market · signals
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ padding: "4px 10px", borderRadius: 20,
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
            fontSize: "0.714rem", color: "var(--color-up)", fontWeight: 600 }}>
            🟢 Live Data
          </div>
          <button onClick={clearChat} title="Clear chat"
            style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)",
              background: "var(--surface-03)", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center" }}>
            <X size={13} color="var(--text-tertiary)" />
          </button>
        </div>
      </div>

      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: "var(--border-radius)", padding: "6px 12px", marginBottom: 8, flexShrink: 0,
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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, flexShrink: 0 }}>
        {SUGGESTIONS.slice(0, 8).map(s => (
          <button key={s} onClick={() => send(s)}
            style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.714rem",
              background: "var(--surface-03)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s" }}>
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder='Ask anything: "Should I buy RELIANCE?" · "Top gainers" · "Compare TCS and INFY"…'
          style={{ flex: 1, padding: "11px 16px", background: "var(--surface-02)",
            border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
            color: "var(--text-primary)", fontSize: "0.857rem", outline: "none" }} />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          style={{ width: 46, height: 46, borderRadius: "var(--border-radius)",
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
