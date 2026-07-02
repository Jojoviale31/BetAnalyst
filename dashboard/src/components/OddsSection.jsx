"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Zap, Search, Trophy, BarChart3 } from "lucide-react";

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.json();
}

function ProbBar({ home, draw, away }) {
  return (
    <div className="flex h-1 rounded-full overflow-hidden">
      <div style={{ width: `${home}%` }} className="bg-brand" />
      <div style={{ width: `${draw}%` }} className="bg-zinc-600" />
      <div style={{ width: `${away}%` }} className="bg-danger" />
    </div>
  );
}

// ─── MATCH ROW ────────────────────────────────────────────

function MatchRow({ match, isSelected, onClick }) {
  const d = match.date ? new Date(match.date) : null;
  const best = match.best;
  const hasVB = match.value_bets?.length > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-surface-3/40 transition-all ${
        isSelected ? "bg-surface-3 border-l-[3px] border-l-brand" : "hover:bg-surface-2 border-l-[3px] border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-zinc-600 flex items-center gap-1">
          {match.source === "wc" ? <Trophy size={9} /> : <BarChart3 size={9} />}
          {match.competition}
        </span>
        <div className="flex items-center gap-1.5">
          {hasVB && (
            <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Zap size={8} /> +{Math.max(...match.value_bets.map(v => v.edge)).toFixed(1)}%
            </span>
          )}
          {d && <span className="text-[10px] text-zinc-600 font-mono">
            {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {match.home_crest && <img src={match.home_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
            <span className="text-sm font-semibold text-zinc-200 truncate">{match.home}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {match.away_crest && <img src={match.away_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
            <span className="text-sm font-semibold text-zinc-200 truncate">{match.away}</span>
          </div>
        </div>
        {best && (
          <div className="shrink-0 text-right">
            <div className="flex gap-2">
              {[
                { label: "1", odds: best.home?.odds, isVB: match.value_bets?.some(v => v.type === "home") },
                { label: "X", odds: best.draw?.odds, isVB: match.value_bets?.some(v => v.type === "draw") },
                { label: "2", odds: best.away?.odds, isVB: match.value_bets?.some(v => v.type === "away") },
              ].map(item => (
                <div key={item.label} className={`text-center w-12 rounded-md py-1 ${item.isVB ? "bg-success/10 border border-success/20" : "bg-surface-3"}`}>
                  <p className="text-[9px] text-zinc-600">{item.label}</p>
                  <p className={`font-mono text-xs font-bold ${item.isVB ? "text-success" : "text-zinc-200"}`}>
                    {item.odds?.toFixed(2) ?? "–"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {best && (
        <div className="mt-2">
          <ProbBar home={best.home?.prob} draw={best.draw?.prob} away={best.away?.prob} />
        </div>
      )}
    </button>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────

function DetailPanel({ match }) {
  const best = match.best;
  const d = match.date ? new Date(match.date) : null;

  return (
    <div className="h-full overflow-y-auto p-5">
      {/* Header */}
      <div className="text-center mb-5">
        {d && <p className="text-xs text-zinc-600 mb-3">
          {d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>}
        <div className="flex items-center justify-center gap-6">
          <div className="text-center flex-1">
            {match.home_crest && <img src={match.home_crest} alt="" className="w-10 h-10 object-contain mx-auto mb-1" />}
            <p className="text-sm font-bold text-zinc-200">{match.home}</p>
          </div>
          <span className="text-xl font-black text-zinc-700">VS</span>
          <div className="text-center flex-1">
            {match.away_crest && <img src={match.away_crest} alt="" className="w-10 h-10 object-contain mx-auto mb-1" />}
            <p className="text-sm font-bold text-zinc-200">{match.away}</p>
          </div>
        </div>
      </div>

      {/* Value bets */}
      {match.value_bets?.length > 0 && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-success" />
            <span className="text-xs font-bold text-success uppercase tracking-wider">Value bets</span>
          </div>
          <div className="space-y-2">
            {match.value_bets.map((vb, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-1 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    {vb.type === "home" ? match.home : vb.type === "away" ? match.away : "Match nul"}
                  </p>
                  <p className="text-[11px] text-zinc-500">Modèle {vb.model_prob}% vs implicite {vb.implied_prob}%</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-success">+{vb.edge}%</p>
                  <p className="text-[10px] text-zinc-600">cote {vb.odds} · Kelly {vb.kelly_pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best odds summary */}
      {best && (
        <>
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Meilleures cotes ({match.books_count} bookmakers)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "1 — " + match.home, odds: best.home?.odds, prob: best.home?.prob, bk: best.home?.bookmaker, type: "home" },
                { label: "X — Nul", odds: best.draw?.odds, prob: best.draw?.prob, bk: best.draw?.bookmaker, type: "draw" },
                { label: "2 — " + match.away, odds: best.away?.odds, prob: best.away?.prob, bk: best.away?.bookmaker, type: "away" },
              ].map(item => {
                const isVB = match.value_bets?.some(v => v.type === item.type);
                return (
                  <div key={item.label} className={`rounded-xl p-3 text-center border ${isVB ? "bg-success/5 border-success/20" : "bg-surface-2 border-surface-3"}`}>
                    <p className="text-[10px] text-zinc-500 mb-1 truncate">{item.label}</p>
                    <p className={`text-2xl font-black font-mono ${isVB ? "text-success" : "text-zinc-100"}`}>
                      {item.odds?.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{item.prob?.toFixed(1)}%</p>
                    <p className="text-[10px] text-zinc-700 truncate mt-0.5">{item.bk}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <ProbBar home={best.home?.prob} draw={best.draw?.prob} away={best.away?.prob} />
            </div>
          </div>

          {/* Full bookmaker table */}
          <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
            <div className="grid grid-cols-[1fr_56px_56px_56px] text-[10px] font-semibold text-zinc-600 uppercase px-4 py-2.5 border-b border-surface-3">
              <span>Bookmaker</span>
              <span className="text-center">1</span>
              <span className="text-center">X</span>
              <span className="text-center">2</span>
            </div>
            <div className="divide-y divide-surface-3/30 max-h-[500px] overflow-y-auto">
              {match.bookmakers?.map((bk, i) => (
                <div key={i} className="grid grid-cols-[1fr_56px_56px_56px] px-4 py-2 hover:bg-surface-3/20 transition-colors">
                  <span className="text-xs text-zinc-400 truncate pr-2">{bk.name || bk.bookmaker}</span>
                  {["home", "draw", "away"].map(t => {
                    const v = bk[t];
                    const isBest = v === best[t]?.odds;
                    return (
                      <span key={t} className={`text-center font-mono text-xs ${isBest ? "text-success font-bold" : "text-zinc-400"}`}>
                        {v?.toFixed(2) || "–"}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────

export default function OddsSection() {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all"); // all | wc | clubs

  useEffect(() => {
    Promise.all([
      apiFetch("/api/worldcup/matches").catch(() => ({ matches: [] })),
      apiFetch("/api/upcoming-all").catch(() => ({ predictions: [] })),
    ]).then(([wc, clubs]) => {
      const wcMatches = (wc.matches || [])
        .filter(m => !m.is_finished && m.best_odds?.home?.odds)
        .map(m => ({
          id: `wc-${m.id}`,
          source: "wc",
          competition: m.group ? `Groupe ${m.group.replace("GROUP_", "")}` : "WC 2026",
          home: m.home,
          away: m.away,
          home_crest: m.home_crest,
          away_crest: m.away_crest,
          date: m.commence,
          best: m.best_odds,
          bookmakers: m.all_odds,
          books_count: m.bookmakers_count,
          value_bets: m.wc_value_bets || [],
        }));

      const clubMatches = (clubs.predictions || [])
        .filter(p => p.prediction && p.odds?.best_home)
        .map(p => ({
          id: `club-${p.match.id}`,
          source: "clubs",
          competition: "Clubs",
          home: p.match.home,
          away: p.match.away,
          date: p.match.date,
          best: {
            home: { odds: p.odds.best_home, prob: p.prediction.home_win * 100 },
            draw: { odds: p.odds.best_draw, prob: p.prediction.draw * 100 },
            away: { odds: p.odds.best_away, prob: p.prediction.away_win * 100 },
          },
          bookmakers: p.odds.bookmakers?.map(bk => ({
            name: bk.name,
            home: bk.home,
            draw: bk.draw,
            away: bk.away,
          })),
          books_count: p.odds.bookmakers?.length || 0,
          value_bets: p.value_bets || [],
        }));

      // Tri : value bets en premier, puis par date
      const all = [...wcMatches, ...clubMatches].sort((a, b) => {
        const aEdge = Math.max(...(a.value_bets.map(v => v.edge) || [0]), 0);
        const bEdge = Math.max(...(b.value_bets.map(v => v.edge) || [0]), 0);
        if (aEdge !== bEdge) return bEdge - aEdge;
        return new Date(a.date || 0) - new Date(b.date || 0);
      });

      setMatches(all);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => matches.filter(m => {
    if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return m.home.toLowerCase().includes(s) || m.away.toLowerCase().includes(s);
    }
    return true;
  }), [matches, search, sourceFilter]);

  const vbCount = matches.filter(m => m.value_bets?.length > 0).length;
  const wcCount = matches.filter(m => m.source === "wc").length;
  const clubCount = matches.filter(m => m.source === "clubs").length;

  return (
    <div className="flex h-[calc(100vh-96px)]">
      {/* Left list */}
      <div className="w-[340px] border-r border-surface-3 flex flex-col bg-surface-1">
        <div className="px-4 pt-3 pb-2 border-b border-surface-3">
          <div className="mb-2">
            <p className="text-sm font-bold text-zinc-100">Comparateur de cotes</p>
            <p className="text-[11px] text-zinc-600">
              {matches.length} matchs
              {vbCount > 0 && <span className="text-success"> · {vbCount} value bets</span>}
            </p>
          </div>

          {/* Source filter */}
          <div className="flex gap-1 mb-2">
            {[
              ["all", "Tous", matches.length],
              ["wc", "World Cup", wcCount],
              ["clubs", "Clubs", clubCount],
            ].map(([val, label, count]) => (
              <button key={val} onClick={() => setSourceFilter(val)}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${sourceFilter === val ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-300"}`}>
                {label} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Rechercher une équipe..."
              className="w-full bg-surface-3 border border-surface-4 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>}
          {!loading && filtered.length === 0 && <p className="text-center text-xs text-zinc-600 py-10">Aucun match</p>}
          {!loading && filtered.map(m => (
            <MatchRow key={m.id} match={m}
              isSelected={selected?.id === m.id}
              onClick={() => setSelected(m)} />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <DetailPanel match={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 flex items-center justify-center">
              <BarChart3 size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-semibold text-zinc-500">Sélectionne un match</p>
            <p className="text-xs text-zinc-700">meilleures cotes · comparaison bookmakers · value bets</p>
          </div>
        )}
      </div>
    </div>
  );
}
