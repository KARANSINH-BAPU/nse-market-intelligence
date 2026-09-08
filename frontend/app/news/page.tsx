"use client";
/**
 * KP — News Page (Live RSS Aggregator)
 * Economic Times, Moneycontrol, Business Standard, LiveMint
 */
import { useEffect, useState, useCallback } from "react";
import { Newspaper, RefreshCw, ExternalLink, Clock, Filter, TrendingUp } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Article {
  title: string; link: string | null; summary: string | null;
  source: string; category: string; published: string | null;
}

const SOURCE_COLORS: Record<string, string> = {
  "Economic Times":   "#e31e24",
  "Moneycontrol":     "#014580",
  "Business Standard":"#de2b2b",
  "LiveMint":         "#0d6efd",
};

function timeAgo(pub: string | null): string {
  if (!pub) return "Recently";
  try {
    const d = new Date(pub);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffH = Math.floor(diffMins / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch { return "Recently"; }
}

function NewsCard({ article }: { article: Article }) {
  const col = SOURCE_COLORS[article.source] ?? "#6366f1";
  const ago  = timeAgo(article.published);
  return (
    <a href={article.link ?? "#"} target="_blank" rel="noopener noreferrer"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="card" style={{ padding: "14px 16px", marginBottom: 10,
        transition: "border-color 0.15s, transform 0.1s",
        cursor: "pointer" }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = col;
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "";
          (e.currentTarget as HTMLDivElement).style.transform = "";
        }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.4, marginBottom: 6,
              color: "var(--text-primary)" }}>
              {article.title}
            </div>
            {article.summary && (
              <div style={{ fontSize: "0.786rem", color: "var(--text-secondary)", lineHeight: 1.5,
                overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as any }}>
                {article.summary}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem",
                fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}33` }}>
                {article.source}
              </span>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.714rem",
                background: "var(--surface-03)", color: "var(--text-tertiary)" }}>
                {article.category}
              </span>
              <span style={{ fontSize: "0.714rem", color: "var(--text-tertiary)",
                display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={10} /> {ago}
              </span>
            </div>
          </div>
          <ExternalLink size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }} />
        </div>
      </div>
    </a>
  );
}

export default function NewsPage() {
  const [articles,  setArticles]  = useState<Article[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [lastAt,    setLastAt]    = useState("");
  const [filterSrc, setFilterSrc] = useState("");
  const [search,    setSearch]    = useState("");
  const [total,     setTotal]     = useState(0);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/news?limit=80`);
      if (r.ok) {
        const d = await r.json();
        setArticles(d.news ?? d.articles ?? []);
        setTotal(d.total ?? 0);
        setLastAt(new Date().toLocaleTimeString("en-IN"));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);
  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(fetchNews, 300000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const shown = articles
    .filter(a => !filterSrc || a.source === filterSrc)
    .filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.summary ?? "").toLowerCase().includes(search.toLowerCase()));

  const sources = [...new Set(articles.map(a => a.source))];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8 }}>
            <Newspaper size={20} /> Market News
          </h1>
          <p style={{ fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
            Live RSS from ET · Moneycontrol · Business Standard · LiveMint ·
            {total} articles{lastAt ? ` · ${lastAt}` : ""}
          </p>
        </div>
        <button onClick={fetchNews}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px",
            background: "var(--surface-03)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--border-radius)",
            cursor: "pointer", fontSize: "0.786rem" }}>
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search news…"
          style={{ flex: "1 1 220px", padding: "8px 12px", background: "var(--surface-03)",
            border: "1px solid var(--border)", borderRadius: "var(--border-radius)",
            color: "var(--text-primary)", fontSize: "0.857rem", outline: "none" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFilterSrc("")}
            style={{ padding: "6px 12px", borderRadius: "var(--border-radius)",
              border: `1px solid ${!filterSrc ? "var(--accent)" : "var(--border)"}`,
              background: !filterSrc ? "rgba(99,102,241,0.12)" : "var(--surface-03)",
              color: !filterSrc ? "var(--accent-bright)" : "var(--text-secondary)",
              cursor: "pointer", fontSize: "0.786rem", fontWeight: !filterSrc ? 700 : 500 }}>
            All Sources
          </button>
          {sources.map(src => {
            const col = SOURCE_COLORS[src] ?? "#6366f1";
            const active = filterSrc === src;
            return (
              <button key={src} onClick={() => setFilterSrc(active ? "" : src)}
                style={{ padding: "6px 12px", borderRadius: "var(--border-radius)",
                  border: `1px solid ${active ? col : "var(--border)"}`,
                  background: active ? `${col}18` : "var(--surface-03)",
                  color: active ? col : "var(--text-secondary)",
                  cursor: "pointer", fontSize: "0.786rem", fontWeight: active ? 700 : 500 }}>
                {src}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {sources.map(src => {
          const count = articles.filter(a => a.source === src).length;
          const col   = SOURCE_COLORS[src] ?? "#6366f1";
          return (
            <div key={src} style={{ padding: "6px 12px", borderRadius: "var(--border-radius)",
              background: `${col}12`, border: `1px solid ${col}33`,
              fontSize: "0.786rem", color: col, fontWeight: 600 }}>
              {src}: {count}
            </div>
          );
        })}
        <div style={{ padding: "6px 12px", borderRadius: "var(--border-radius)",
          background: "var(--surface-03)", border: "1px solid var(--border)",
          fontSize: "0.786rem", color: "var(--text-tertiary)" }}>
          Showing: {shown.length}
        </div>
      </div>

      {/* Loading */}
      {loading && articles.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-tertiary)" }}>
          <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
          Fetching live news from RSS feeds…
        </div>
      )}

      {/* News list */}
      {shown.map((a, i) => <NewsCard key={i} article={a} />)}

      {!loading && shown.length === 0 && articles.length > 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-tertiary)" }}>
          No articles match your search.
        </div>
      )}

      {!loading && articles.length === 0 && (
        <div className="card" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-tertiary)" }}>
          <Newspaper size={32} style={{ opacity: 0.3, marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
          <div>Could not fetch news. RSS feeds may be temporarily unavailable.</div>
          <button onClick={fetchNews} style={{ marginTop: 12, padding: "8px 16px",
            background: "var(--accent)", border: "none", borderRadius: "var(--border-radius)",
            color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            Try Again
          </button>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
