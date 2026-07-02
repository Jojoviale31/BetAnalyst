"use client";

import { useState, useEffect } from "react";
import { Loader2, ExternalLink, Search, Globe } from "lucide-react";

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.json();
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

function ArticleCard({ article }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-surface-2 rounded-xl border border-surface-3 overflow-hidden hover:border-surface-4 hover:bg-surface-3/50 transition-all"
    >
      {/* Image */}
      {article.image ? (
        <div className="h-40 overflow-hidden bg-surface-3">
          <img
            src={article.image}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.target.parentElement.style.display = "none"; }}
          />
        </div>
      ) : (
        <div className="h-28 bg-gradient-to-br from-surface-3 to-surface-4 flex items-center justify-center">
          <Globe size={28} className="text-zinc-700" />
        </div>
      )}

      <div className="p-3 flex flex-col flex-1">
        {/* Source + time */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            article.lang === "fr" ? "bg-brand/10 text-brand-light" : "bg-surface-3 text-zinc-500"
          }`}>
            {article.source}
          </span>
          <span className="text-[10px] text-zinc-600">{timeAgo(article.date)}</span>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-3 flex-1 group-hover:text-zinc-100 transition-colors">
          {article.title}
        </p>

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {article.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[10px] text-zinc-600 bg-surface-3 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 mt-2 text-[10px] text-zinc-700 group-hover:text-zinc-500 transition-colors">
          <ExternalLink size={9} /> Lire l'article
        </div>
      </div>
    </a>
  );
}

export default function NewsSection() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    apiFetch("/api/news")
      .then(d => { setArticles(d.articles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = articles.filter(a => {
    if (langFilter !== "all" && a.lang !== langFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.title.toLowerCase().includes(s) || a.source.toLowerCase().includes(s) || a.tags?.some(t => t.toLowerCase().includes(s));
    }
    return true;
  });

  const frCount = articles.filter(a => a.lang === "fr").length;
  const enCount = articles.filter(a => a.lang === "en").length;

  return (
    <div className="h-[calc(100vh-96px)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-surface-1/90 backdrop-blur-sm border-b border-surface-3 px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Lang filter */}
          <div className="flex gap-1">
            {[["all", `Tous (${articles.length})`], ["fr", `FR (${frCount})`], ["en", `EN (${enCount})`]].map(([val, label]) => (
              <button key={val} onClick={() => setLangFilter(val)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${langFilter === val ? "bg-brand/10 text-brand-light" : "bg-surface-2 text-zinc-500 hover:text-zinc-300 border border-surface-3"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand" />
          </div>

          <span className="text-[11px] text-zinc-600 ml-auto">
            {filtered.length} articles · mise à jour toutes les 10 min
          </span>
        </div>
      </div>

      <div className="px-6 py-5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={20} className="animate-spin text-zinc-600" />
            <p className="text-xs text-zinc-600">Chargement des actualités...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center text-sm text-zinc-600 py-16">Aucun article trouvé</p>
        )}

        {!loading && (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
            {filtered.map((a, i) => (
              <div key={i} className="break-inside-avoid mb-4">
                <ArticleCard article={a} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
