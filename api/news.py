"""
Actualités sportives — flux RSS en temps réel.

Sources :
- The Guardian Football
- TalkSport
- Google News FR (Coupe du Monde)
- Google News EN (World Cup 2026)
"""

import httpx
import time
import feedparser
from datetime import datetime
from email.utils import parsedate_to_datetime
from fastapi import APIRouter

router = APIRouter(prefix="/api/news", tags=["news"])

RSS_FEEDS = [
    {
        "name": "The Guardian",
        "url": "https://www.theguardian.com/football/rss",
        "lang": "en",
        "logo": "https://assets.guim.co.uk/images/guardian-logo-rss.c45beb1bafa34b347ac333af2e6fe23f.png",
    },
    {
        "name": "TalkSport",
        "url": "https://talksport.com/feed/",
        "lang": "en",
        "logo": None,
    },
    {
        "name": "L'Équipe (Google News)",
        "url": "https://news.google.com/rss/search?q=coupe+du+monde+2026+football&hl=fr&gl=FR&ceid=FR:fr",
        "lang": "fr",
        "logo": None,
    },
    {
        "name": "World Cup 2026 (Google News)",
        "url": "https://news.google.com/rss/search?q=FIFA+World+Cup+2026&hl=en&gl=US&ceid=US:en",
        "lang": "en",
        "logo": None,
    },
]

_cache: dict = {}
CACHE_TTL = 600  # 10 minutes


def get_image(entry) -> str | None:
    """Extrait l'URL d'image depuis un article RSS."""
    for key in ["media_content", "media_thumbnail"]:
        items = getattr(entry, key, None) or entry.get(key)
        if items and isinstance(items, list) and items[0].get("url"):
            return items[0]["url"]
    for link in entry.get("links", []):
        if link.get("type", "").startswith("image"):
            return link.get("href")
    return None


def parse_date(entry) -> str:
    """Retourne la date au format ISO depuis un article RSS."""
    for field in ["published", "updated"]:
        raw = entry.get(field)
        if raw:
            try:
                return parsedate_to_datetime(raw).isoformat()
            except Exception:
                try:
                    return datetime(*entry.get(f"{field}_parsed", [])[:6]).isoformat()
                except Exception:
                    pass
    return datetime.utcnow().isoformat()


def extract_source_from_title(title: str) -> str | None:
    """Google News encode la source dans le titre : 'Titre - Source'."""
    if " - " in title:
        return title.split(" - ")[-1].strip()
    return None


async def fetch_feed(feed_info: dict, client: httpx.AsyncClient) -> list:
    try:
        resp = await client.get(
            feed_info["url"],
            headers={"User-Agent": "Mozilla/5.0 BetAnalytics/2.0"},
            timeout=8,
            follow_redirects=True,
        )
        parsed = feedparser.parse(resp.text)
        articles = []
        for e in parsed.entries[:15]:
            title = e.get("title", "")
            source = extract_source_from_title(title) or feed_info["name"]
            clean_title = title.rsplit(" - ", 1)[0] if " - " in title else title

            tags = [t.get("term", "") for t in e.get("tags", [])]

            articles.append({
                "title": clean_title,
                "link": e.get("link", ""),
                "source": source,
                "lang": feed_info["lang"],
                "date": parse_date(e),
                "image": get_image(e),
                "summary": e.get("summary", "")[:200].replace("<p>", "").replace("</p>", "").replace("<br />", " ").strip(),
                "tags": tags[:5],
                "wc_related": any(
                    kw in title.lower() or kw in " ".join(tags).lower()
                    for kw in ["world cup", "coupe du monde", "fifa", "wc 2026", "2026"]
                ),
            })
        return articles
    except Exception:
        return []


@router.get("")
async def get_news(lang: str = "all"):
    """Agrège les flux RSS sportifs et retourne les articles récents."""
    cache_key = f"news_{lang}"
    entry = _cache.get(cache_key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
        return entry["data"]

    feeds = RSS_FEEDS if lang == "all" else [f for f in RSS_FEEDS if f["lang"] == lang or lang == "all"]

    async with httpx.AsyncClient() as client:
        import asyncio
        results = await asyncio.gather(*[fetch_feed(f, client) for f in feeds])

    all_articles = []
    seen_titles: set = set()
    for articles in results:
        for a in articles:
            key = a["title"].lower()[:60]
            if key not in seen_titles:
                seen_titles.add(key)
                all_articles.append(a)

    # Tri par date décroissante
    all_articles.sort(key=lambda a: a["date"], reverse=True)
    all_articles = all_articles[:60]

    result = {"articles": all_articles, "count": len(all_articles)}
    _cache[cache_key] = {"data": result, "ts": time.time()}
    return result
