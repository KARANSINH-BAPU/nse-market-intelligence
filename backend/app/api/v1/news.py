"""
KP — News Proxy API

Fetches Indian financial news from multiple RSS sources and returns
normalized JSON. Acts as a CORS-safe proxy for the frontend.

Sources (all public RSS feeds):
  - Economic Times Markets
  - Moneycontrol Markets
  - Business Standard Markets
  - LiveMint Markets
"""
from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Query

log = structlog.get_logger(__name__)
router = APIRouter()

NEWS_SOURCES = [
    {
        "name":     "Economic Times",
        "url":      "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "category": "Markets",
    },
    {
        "name":     "Moneycontrol",
        "url":      "https://www.moneycontrol.com/rss/MCtopnews.xml",
        "category": "Top News",
    },
    {
        "name":     "Business Standard",
        "url":      "https://www.business-standard.com/rss/markets-106.rss",
        "category": "Markets",
    },
    {
        "name":     "LiveMint",
        "url":      "https://www.livemint.com/rss/markets",
        "category": "Markets",
    },
]


def _parse_rss(xml_text: str, source_name: str, category: str) -> list[dict]:
    """Parse RSS XML and return list of news items."""
    items = []
    try:
        root = ET.fromstring(xml_text)
        # Handle both RSS and Atom
        channel = root.find("channel")
        entries = channel.findall("item") if channel is not None else root.findall(".//{http://www.w3.org/2005/Atom}entry")

        for item in entries[:15]:
            def _text(tag: str) -> str | None:
                el = item.find(tag)
                return el.text.strip() if el is not None and el.text else None

            title = _text("title")
            link  = _text("link")
            desc  = _text("description")
            pub_date = _text("pubDate") or _text("published")

            if not title:
                continue

            # Clean HTML from description
            if desc:
                import re
                desc = re.sub(r"<[^>]+>", "", desc).strip()[:300]

            # Parse pub_date
            ts = None
            if pub_date:
                for fmt in ["%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
                            "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z"]:
                    try:
                        ts = datetime.strptime(pub_date[:30], fmt[:len(pub_date[:30])]).isoformat()
                        break
                    except Exception:
                        pass

            items.append({
                "title":     title,
                "link":      link,
                "summary":   desc,
                "source":    source_name,
                "category":  category,
                "published": ts or pub_date,
            })
    except Exception as e:
        log.warning("rss_parse_error", source=source_name, error=str(e)[:100])

    return items


@router.get("", response_model=dict)
async def get_news(
    category: str | None = Query(None),
    limit:    int        = Query(40, ge=5, le=100),
) -> dict:
    """
    Fetch and aggregate Indian financial news from multiple RSS sources.
    Returns up to `limit` items sorted by publish date (newest first).
    """
    async def _fetch_source(src: dict) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(src["url"], headers={
                    "User-Agent": "Mozilla/5.0 KP-Finance-Platform/1.0"
                })
                if resp.status_code == 200:
                    return _parse_rss(resp.text, src["name"], src["category"])
        except Exception as e:
            log.warning("news_fetch_error", source=src["name"], error=str(e)[:80])
        return []

    # Fetch all sources in parallel
    results = await asyncio.gather(*[_fetch_source(s) for s in NEWS_SOURCES])
    all_news: list[dict] = [item for source_items in results for item in source_items]

    # Filter by category if specified
    if category:
        all_news = [n for n in all_news if n["category"].lower() == category.lower()]

    # Sort by published date (newest first)
    def _sort_key(item: dict):
        p = item.get("published") or ""
        return p

    all_news.sort(key=_sort_key, reverse=True)

    return {
        "news":    all_news[:limit],
        "total":   len(all_news),
        "sources": [s["name"] for s in NEWS_SOURCES],
    }
