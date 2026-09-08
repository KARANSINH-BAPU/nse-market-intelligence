"use client";
/**
 * KP — News Page
 * Aggregated Indian financial news from ET, Moneycontrol, Business Standard, LiveMint.
 */
import { useCallback, useEffect, useState } from "react";
import { Newspaper, ExternalLink, RefreshCw, Clock } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface NewsItem {
  title: string; link: string | null; summary: string | null;
  source: string; category: string; published: string | null;
}

const SOURCE_COLORS: Record<string, string> = {
  "Economic Times":   "#f97316",
  "Moneycontrol":     "#3b82f6",
  "Business Standard": "#8b5cf6",
  "LiveMint":         "#10b981",
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch { return ""; }
}

export default function NewsPage() {
  const [news,    setNews]    = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [srcFilter, setSrcFilter] = useState("");
  const [lastAt,  setLastAt]  = useState<Date | null>(null);
  const [error,   setError]   = useState("");

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/v1/news?limit=80`);
      if (r.ok) {
        const d = await r.json();
        setNews(d.news || []);
        setSources(d.sources || []);
        setLastAt(new Date());
      } else {
        setError("Failed to fetch news. The backend may be starting up.");
      }
    } catch (e) {
      setError("Could not connect to news service.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const filtered = srcFilter ? news.filter(n => n.source === srcFilter) : news;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Newspaper size={20} /> Market News
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            {filtered.length} articles · {sources.join(", ")}
            {lastAt ? ` · Updated ${lastAt.toLocaleTimeString("en-IN")}` : ""}
          </p>
        </div>
        <button onClick={fetchNews} style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--surface-03)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
          padding: "6px 12px", cursor: "pointer", fontSize: "0.786rem",
        }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Source filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setSrcFilter("")}
          style={{
            padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: "0.75rem",
            background: !srcFilter ? "var(--accent)" : "var(--surface-03)",
            border: `1px solid ${!srcFilter ? "var(--accent)" : "var(--border)"}`,
            color: !srcFilter ? "#fff" : "var(--text-secondary)", fontWeight: 600,
          }}>All Sources</button>
        {sources.map(s => (
          <button key={s} onClick={() => setSrcFilter(s === srcFilter ? "" : s)}
            style={{
              padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontSize: "0.75rem",
              background: srcFilter === s ? `${SOURCE_COLORS[s] ?? "#6366f1"}22` : "var(--surface-03)",
              border: `1px solid ${srcFilter === s ? (SOURCE_COLORS[s] ?? "#6366f1") : "var(--border)"}`,
              color: srcFilter === s ? (SOURCE_COLORS[s] ?? "var(--accent-bright)") : "var(--text-secondary)",
              fontWeight: 600,
            }}>{s}</button>
        ))}
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "var(--border-radius)", padding: "12px 16px", marginBottom: 16,
          color: "var(--color-down)", fontSize: "0.857rem",
        }}>{error}</div>
      )}

      {loading && (
        <div className="card" style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
          Fetching news from {sources.length || 4} sources…
        </div>
      )}

      {/* News grid */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {filtered.map((item, i) => (
            <a key={i} href={item.link || "#"} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none" }}>
              <div className="card" style={{
                height: "100%", cursor: "pointer",
                transition: "transform 0.15s ease, border-color 0.15s",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.borderColor = "";
                }}>
                {/* Source badge + time */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{
                    fontSize: "0.643rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                    background: `${SOURCE_COLORS[item.source] ?? "#6366f1"}22`,
                    color: SOURCE_COLORS[item.source] ?? "var(--accent-bright)",
                  }}>{item.source}</span>
                  {item.published && (
                    <span style={{ fontSize: "0.643rem", color: "var(--text-tertiary)",
                      display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock size={9} /> {timeAgo(item.published)}
                    </span>
                  )}
                </div>

                {/* Title */}
                <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.4,
                  color: "var(--text-primary)", marginBottom: 8 }}>
                  {item.title}
                </div>

                {/* Summary */}
                {item.summary && (
                  <div style={{ fontSize: "0.786rem", color: "var(--text-secondary)",
                    lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.summary}
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 4,
                  fontSize: "0.714rem", color: "var(--accent-bright)" }}>
                  <ExternalLink size={10} /> Read more
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: "60px 0", color: "var(--text-tertiary)" }}>
          No news available. RSS feeds may be temporarily unavailable.
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
