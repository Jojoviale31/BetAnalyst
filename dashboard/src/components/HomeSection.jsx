"use client";

import { useState, useEffect } from "react";
import { Radio, Loader2, Zap, Clock, TrendingUp, Target } from "lucide-react";

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.json();
}

function fmt(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
  const label = today ? "Aujourd'hui" : tomorrow ? "Demain" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return { label, time };
}

const STAGE_LABELS = {
  LAST_32: "Huitièmes de finale",
  ROUND_OF_16: "Huitièmes de finale",
  QUARTER_FINALS: "Quarts de finale",
  SEMI_FINALS: "Demi-finales",
  THIRD_PLACE: "3e place",
  FINAL: "Finale",
};

function stageLabel(match) {
  if (match.group) return `Groupe ${match.group.replace("GROUP_", "")}`;
  return STAGE_LABELS[match.stage] || "FIFA World Cup 2026";
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

// ─── CARTE MATCH ──────────────────────────────────────────

function MatchCard({ match, prediction, valueBets, onClick, isLive }) {
  const [selected, setSelected] = useState(null);
  const { label, time } = match.commence ? fmt(match.commence) : { label: "", time: "" };
  const best = match.best_odds;
  const score = match.score;
  const hasScore = score?.home !== null && score?.home !== undefined;
  const pred = prediction || match.wc_prediction;
  const vbs = valueBets || match.wc_value_bets || [];
  const topScore = pred?.top_scores?.[0];
  const hasOdds = !!best?.home?.odds;
  const isValueType = (t) => vbs?.some(v => v.type === t);

  // Probas : bookmaker si dispo, sinon modèle Poisson WC
  const homePct = hasOdds ? best.home.prob : pred ? (pred.home_win * 100) : null;
  const drawPct = hasOdds ? best.draw.prob : pred ? (pred.draw * 100) : null;
  const awayPct = hasOdds ? best.away.prob : pred ? (pred.away_win * 100) : null;

  return (
    <div
      onClick={onClick}
      className={`bg-surface-2 rounded-2xl border overflow-hidden cursor-pointer transition-all hover:border-zinc-600 ${
        isLive ? "border-danger/40" : vbs?.length > 0 ? "border-success/20" : "border-surface-3"
      }`}
    >
      {isLive && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-danger/10 border-b border-danger/20">
          <Radio size={10} className="text-danger animate-pulse" />
          <span className="text-[11px] font-bold text-danger tracking-widest">EN DIRECT</span>
        </div>
      )}

      <div className="p-4">
        {/* Meta : stage + date + value badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-zinc-600">{stageLabel(match)}</span>
          <div className="flex items-center gap-2">
            {vbs?.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                <Zap size={9} /> +{Math.max(...vbs.map(v => v.edge)).toFixed(1)}%
              </span>
            )}
            {!isLive && match.commence && (
              <span className="text-[10px] text-zinc-500 font-mono">
                {label} · {time}
              </span>
            )}
          </div>
        </div>

        {/* Équipes + score */}
        {hasScore ? (
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 text-right">
              {match.home_crest && <img src={match.home_crest} alt="" className="w-10 h-10 object-contain ml-auto mb-1" />}
              <p className={`text-sm font-bold ${score.winner === "HOME_TEAM" ? "text-zinc-100" : "text-zinc-500"}`}>{match.home}</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-3xl font-black font-mono text-zinc-100 leading-none">
                {score.home}<span className="text-zinc-600 mx-1">–</span>{score.away}
              </p>
              {score.ht_home !== null && score.ht_home !== undefined && (
                <p className="text-[10px] text-zinc-600 mt-1">MT {score.ht_home}–{score.ht_away}</p>
              )}
            </div>
            <div className="flex-1">
              {match.away_crest && <img src={match.away_crest} alt="" className="w-10 h-10 object-contain mr-auto mb-1" />}
              <p className={`text-sm font-bold ${score.winner === "AWAY_TEAM" ? "text-zinc-100" : "text-zinc-500"}`}>{match.away}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Score prédit en hero */}
            {topScore && (
              <div className="text-center mb-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Score prédit</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    {match.home_crest && <img src={match.home_crest} alt="" className="w-10 h-10 object-contain mx-auto mb-1" />}
                    <p className="text-xs text-zinc-400 truncate max-w-[80px]">{match.home}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-black font-mono text-zinc-100">
                      {topScore.score.split("-")[0]}<span className="text-zinc-600 mx-1.5">–</span>{topScore.score.split("-")[1]}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{topScore.prob}% de probabilité</p>
                  </div>
                  <div className="text-center">
                    {match.away_crest && <img src={match.away_crest} alt="" className="w-10 h-10 object-contain mx-auto mb-1" />}
                    <p className="text-xs text-zinc-400 truncate max-w-[80px]">{match.away}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sans prédiction : équipes normales */}
            {!topScore && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 flex-1">
                  {match.home_crest && <img src={match.home_crest} alt="" className="w-9 h-9 object-contain shrink-0" />}
                  <span className="text-sm font-bold text-zinc-100 leading-tight">{match.home}</span>
                </div>
                <span className="text-sm font-bold text-zinc-600 shrink-0">VS</span>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-sm font-bold text-zinc-100 text-right leading-tight">{match.away}</span>
                  {match.away_crest && <img src={match.away_crest} alt="" className="w-9 h-9 object-contain shrink-0" />}
                </div>
              </div>
            )}
          </>
        )}

        {/* Cotes ou probas — pour les matchs à venir */}
        {!hasScore && (
          <div className="space-y-2">
            {hasOdds ? (
              <div className="flex gap-2">
                {[
                  { label: match.home_tla || "1", type: "home", odds: best.home.odds, pct: homePct },
                  { label: "X", type: "draw", odds: best.draw.odds, pct: drawPct },
                  { label: match.away_tla || "2", type: "away", odds: best.away.odds, pct: awayPct },
                ].map(item => {
                  const isVB = isValueType(item.type);
                  const isSel = selected === item.type;
                  return (
                    <button
                      key={item.label}
                      onClick={e => { e.stopPropagation(); setSelected(s => s === item.type ? null : item.type); }}
                      className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border transition-all ${
                        isSel ? "bg-brand border-brand" :
                        isVB ? "bg-success/5 border-success/30 hover:bg-success/10" :
                        "bg-surface-3 border-surface-4 hover:bg-surface-4"
                      }`}
                    >
                      <span className={`text-[10px] font-semibold ${isSel ? "text-white/70" : "text-zinc-500"}`}>{item.label}</span>
                      <span className={`text-lg font-black font-mono ${isSel ? "text-white" : isVB ? "text-success" : "text-zinc-100"}`}>
                        {item.odds?.toFixed(2)}
                      </span>
                      <span className={`text-[10px] ${isSel ? "text-white/60" : isVB ? "text-success/70" : "text-zinc-600"}`}>
                        {item.pct?.toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : homePct ? (
              <div className="flex gap-2">
                {[
                  { label: match.home_tla || "1", pct: homePct, isVB: isValueType("home") },
                  { label: "X", pct: drawPct, isVB: false },
                  { label: match.away_tla || "2", pct: awayPct, isVB: isValueType("away") },
                ].map(item => (
                  <div key={item.label} className={`flex-1 flex flex-col items-center py-2 rounded-xl border ${
                    item.isVB ? "bg-success/5 border-success/20" : "bg-surface-3 border-surface-4"
                  }`}>
                    <span className="text-[10px] text-zinc-500">{item.label}</span>
                    <span className={`text-sm font-bold ${item.isVB ? "text-success" : "text-zinc-200"}`}>{parseFloat(item.pct).toFixed(0)}%</span>
                    <span className="text-[9px] text-zinc-700">Modèle</span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Barre de probas */}
            {homePct && (
              <ProbBar home={parseFloat(homePct)} draw={parseFloat(drawPct)} away={parseFloat(awayPct)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────

export default function HomeSection({ onNavigate }) {
  const [wcMatches, setWcMatches] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("wc");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/worldcup/matches"),
      apiFetch("/api/upcoming-all"),
    ]).then(([wc, preds]) => {
      const sorted = (wc.matches || []).sort((a, b) => {
        if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
        if (a.is_finished !== b.is_finished) return a.is_finished ? 1 : -1;
        return new Date(a.commence || 0) - new Date(b.commence || 0);
      });
      setWcMatches(sorted);
      setPredictions((preds.predictions || []).filter(p => p.prediction));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const upcoming = wcMatches.filter(m => !m.is_finished);
  const live = wcMatches.filter(m => m.is_live);
  const vbCount = predictions.filter(p => p.value_bets?.length > 0).length;

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-96px)]">
      <Loader2 size={20} className="animate-spin text-zinc-600" />
    </div>
  );

  return (
    <div className="h-[calc(100vh-96px)] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-5">

        {/* Live banner */}
        {live.length > 0 && (
          <div className="flex items-center gap-2 mb-4 bg-danger/5 border border-danger/20 rounded-xl px-4 py-2.5">
            <Radio size={12} className="text-danger animate-pulse" />
            <span className="text-sm font-bold text-danger">{live.length} match{live.length > 1 ? "s" : ""} en direct</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setTab("wc")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === "wc" ? "bg-brand text-white" : "bg-surface-2 text-zinc-500 hover:text-zinc-200 border border-surface-3"
            }`}>
            <Radio size={13} /> Coupe du Monde <span className="opacity-70">{upcoming.length}</span>
          </button>
          <button onClick={() => setTab("clubs")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === "clubs" ? "bg-brand text-white" : "bg-surface-2 text-zinc-500 hover:text-zinc-200 border border-surface-3"
            }`}>
            <TrendingUp size={13} /> Value bets clubs
            {vbCount > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === "clubs" ? "bg-white/20 text-white" : "bg-success/10 text-success"}`}>
                {vbCount}
              </span>
            )}
          </button>
        </div>

        {/* WC matches */}
        {tab === "wc" && (
          <div className="space-y-4">
            {upcoming.length === 0 && (
              <p className="text-center text-sm text-zinc-600 py-12">Aucun match à venir</p>
            )}
            {upcoming.map(m => (
              <MatchCard key={m.id} match={m} isLive={m.is_live}
                onClick={() => onNavigate?.("worldcup")} />
            ))}
          </div>
        )}

        {/* Club predictions */}
        {tab === "clubs" && (
          <div className="space-y-4">
            {predictions.length === 0 && (
              <p className="text-center text-sm text-zinc-600 py-12">Aucun match de club disponible</p>
            )}
            {predictions.map((p, i) => {
              const hasOdds = !!p.odds?.best_home;
              const fakeMatch = {
                id: p.match.id,
                home: p.match.home,
                away: p.match.away,
                home_tla: p.match.home.split(" ")[0].slice(0, 3).toUpperCase(),
                away_tla: p.match.away.split(" ")[0].slice(0, 3).toUpperCase(),
                commence: p.match.date,
                best_odds: hasOdds ? {
                  home: { odds: p.odds.best_home, prob: p.prediction.home_win * 100 },
                  draw: { odds: p.odds.best_draw, prob: p.prediction.draw * 100 },
                  away: { odds: p.odds.best_away, prob: p.prediction.away_win * 100 },
                } : null,
                wc_prediction: p.prediction,
                wc_value_bets: p.value_bets,
                score: { home: null, away: null },
                stage: null, group: null,
              };
              return (
                <MatchCard key={i} match={fakeMatch} prediction={p.prediction}
                  valueBets={p.value_bets} isLive={false}
                  onClick={() => onNavigate?.("predictions")} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
