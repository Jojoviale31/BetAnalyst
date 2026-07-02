"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Zap, TrendingUp, Search, Shield } from "lucide-react";
import { fetchUpcomingAll } from "@/lib/api";

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.json();
}

function ProbBar({ home, draw, away }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden">
      <div style={{ width: `${home}%` }} className="bg-brand" />
      <div style={{ width: `${draw}%` }} className="bg-zinc-600" />
      <div style={{ width: `${away}%` }} className="bg-danger" />
    </div>
  );
}

// ─── MATCH ROW ────────────────────────────────────────────

function MatchRow({ p, isSelected, onClick }) {
  const { match, prediction, value_bets } = p;
  const d = new Date(match.date);
  const hasVB = value_bets?.length > 0;
  const topEdge = hasVB ? Math.max(...value_bets.map(v => v.edge)) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-surface-3/40 transition-all ${
        isSelected ? "bg-surface-3 border-l-[3px] border-l-brand" : "hover:bg-surface-2 border-l-[3px] border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-600">
          {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {hasVB && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">
            <Zap size={9} /> +{topEdge.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="space-y-1 mb-2">
        <p className="text-sm font-semibold text-zinc-200 truncate">{match.home}</p>
        <p className="text-sm font-semibold text-zinc-200 truncate">{match.away}</p>
      </div>

      <ProbBar home={prediction.home_win * 100} draw={prediction.draw * 100} away={prediction.away_win * 100} />
      <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
        <span>{(prediction.home_win * 100).toFixed(0)}%</span>
        <span>N {(prediction.draw * 100).toFixed(0)}%</span>
        <span>{(prediction.away_win * 100).toFixed(0)}%</span>
      </div>
    </button>
  );
}

// ─── FORM BADGES ──────────────────────────────────────────

function FormBadges({ form }) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).reverse().map((f, i) => (
        <div key={i}
          title={`${f.opponent} (${f.venue}) ${f.score}`}
          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
            f.result === "W" ? "bg-success/15 text-success" : f.result === "D" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"
          }`}>
          {f.result}
        </div>
      ))}
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────

function DetailPanel({ p }) {
  const { match, prediction, odds, value_bets, context } = p;
  const d = new Date(match.date);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-surface-2 border-b border-surface-3 px-6 pt-5 pb-4">
        <p className="text-[11px] text-zinc-600 text-center mb-4">
          {d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })} à {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <div className="flex items-center justify-center gap-6">
          <span className="text-base font-bold text-zinc-100 text-right flex-1">{match.home}</span>
          <span className="text-xs text-zinc-600 shrink-0">vs</span>
          <span className="text-base font-bold text-zinc-100 flex-1">{match.away}</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Value bets — la feature principale */}
        {value_bets?.length > 0 && (
          <div className="bg-success/5 border border-success/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-success" />
              <span className="text-xs font-bold text-success uppercase tracking-wider">Value bets détectés</span>
            </div>
            <div className="space-y-2">
              {value_bets.map((vb, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-1 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">
                      {vb.type === "home" ? match.home : vb.type === "away" ? match.away : "Match nul"}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Modèle {vb.model_prob}% vs implicite {vb.implied_prob}%
                    </p>
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

        {/* 1X2 */}
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Probabilités Poisson V1</p>
          <ProbBar home={prediction.home_win * 100} draw={prediction.draw * 100} away={prediction.away_win * 100} />
          <div className="grid grid-cols-3 mt-3 text-center">
            {[
              { label: match.home, prob: prediction.home_win, odds: odds.best_home },
              { label: "Nul", prob: prediction.draw, odds: odds.best_draw },
              { label: match.away, prob: prediction.away_win, odds: odds.best_away },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-2xl font-black text-zinc-100">{(item.prob * 100).toFixed(0)}%</p>
                <p className="text-[11px] text-zinc-500 truncate px-1">{item.label}</p>
                {item.odds && <p className="font-mono text-xs text-brand-light mt-0.5">{item.odds.toFixed(2)}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* xG */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-3 text-center border border-surface-3">
            <p className="text-[11px] text-zinc-500">λ {match.home}</p>
            <p className="text-xl font-bold text-brand-light font-mono">{prediction.lambda_home}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3 text-center border border-surface-3">
            <p className="text-[11px] text-zinc-500">λ {match.away}</p>
            <p className="text-xl font-bold text-danger font-mono">{prediction.lambda_away}</p>
          </div>
        </div>

        {/* Top scores */}
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Scores exacts probables</p>
          <div className="grid grid-cols-5 gap-1.5">
            {prediction.top_scores.map((s, i) => (
              <div key={i} className={`rounded-lg py-2 text-center ${i === 0 ? "bg-brand/10 border border-brand/20" : "bg-surface-2 border border-surface-3"}`}>
                <p className={`text-sm font-bold font-mono ${i === 0 ? "text-brand-light" : "text-zinc-300"}`}>{s.score}</p>
                <p className="text-[10px] text-zinc-600">{s.prob}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* O/U + BTTS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-3 border border-surface-3">
            <p className="text-[11px] text-zinc-500">Over 2.5</p>
            <p className="text-xl font-bold text-zinc-100">{(prediction.over_25 * 100).toFixed(0)}%</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3 border border-surface-3">
            <p className="text-[11px] text-zinc-500">BTTS Oui</p>
            <p className="text-xl font-bold text-zinc-100">{(prediction.btts_yes * 100).toFixed(0)}%</p>
          </div>
        </div>

        {/* Form */}
        {(context?.home_form?.length > 0 || context?.away_form?.length > 0) && (
          <div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Forme récente</p>
            <div className="bg-surface-2 rounded-xl border border-surface-3 divide-y divide-surface-3/50">
              {context.home_form?.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-zinc-300 truncate">{match.home}</span>
                  <FormBadges form={context.home_form} />
                </div>
              )}
              {context.away_form?.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-zinc-300 truncate">{match.away}</span>
                  <FormBadges form={context.away_form} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats comparison */}
        {context?.home_stats && context?.away_stats && (
          <div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              <Shield size={11} className="inline mr-1.5" />Stats saison
            </p>
            <div className="bg-surface-2 rounded-xl border border-surface-3 px-4 py-3 space-y-2">
              {[
                ["Bilan", context.home_stats.record, context.away_stats.record],
                ["Buts marqués", context.home_stats.gf, context.away_stats.gf],
                ["Buts encaissés", context.home_stats.ga, context.away_stats.ga],
                ["Diff. de buts", context.home_stats.gd, context.away_stats.gd],
              ].map(([label, h, a]) => (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center text-center">
                  <span className="font-mono text-xs font-semibold text-zinc-200 text-right pr-3">{h}</span>
                  <span className="text-[10px] text-zinc-600 px-2">{label}</span>
                  <span className="font-mono text-xs font-semibold text-zinc-200 text-left pl-3">{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* H2H */}
        {context?.h2h?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Confrontations directes</p>
            <div className="bg-surface-2 rounded-xl border border-surface-3 divide-y divide-surface-3/50">
              {context.h2h.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-zinc-400 truncate">{h.home} – {h.away}</span>
                  <span className="font-mono font-bold text-zinc-200">{h.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bookmakers */}
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">{odds.bookmakers?.length} Bookmakers</p>
          <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
            <div className="grid grid-cols-[1fr_50px_50px_50px] text-[10px] font-semibold text-zinc-600 uppercase px-4 py-2 border-b border-surface-3">
              <span>Book</span><span className="text-center">1</span><span className="text-center">X</span><span className="text-center">2</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto divide-y divide-surface-3/30">
              {odds.bookmakers?.map((bk, i) => (
                <div key={i} className="grid grid-cols-[1fr_50px_50px_50px] px-4 py-1.5">
                  <span className="text-xs text-zinc-500 truncate">{bk.name}</span>
                  <span className="text-center font-mono text-xs text-zinc-400">{bk.home?.toFixed(2) || "–"}</span>
                  <span className="text-center font-mono text-xs text-zinc-400">{bk.draw?.toFixed(2) || "–"}</span>
                  <span className="text-center font-mono text-xs text-zinc-400">{bk.away?.toFixed(2) || "–"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WC MATCH ROW (bookmaker probs) ───────────────────────

function WCMatchRow({ match, isSelected, onClick }) {
  const d = match.commence ? new Date(match.commence) : null;
  const best = match.best_odds;
  const pred = match.wc_prediction;
  const hasOdds = !!best?.home?.odds;
  const hasPred = !!pred;
  // Source des probas : bookmaker si dispo, sinon modèle Poisson WC
  const homeProb = hasOdds ? best.home.prob : hasPred ? (pred.home_win * 100).toFixed(1) : null;
  const drawProb = hasOdds ? best.draw.prob : hasPred ? (pred.draw * 100).toFixed(1) : null;
  const awayProb = hasOdds ? best.away.prob : hasPred ? (pred.away_win * 100).toFixed(1) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-surface-3/40 transition-all ${
        isSelected ? "bg-surface-3 border-l-[3px] border-l-brand" : "hover:bg-surface-2 border-l-[3px] border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-600">
          {match.stage === "LAST_32" ? "Huitièmes" : match.group ? match.group.replace("GROUP_", "Groupe ") : "WC 2026"}
        </span>
        {d && <span className="text-[10px] text-zinc-500 font-mono">
          {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>}
      </div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {match.home_crest && <img src={match.home_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
          <span className="text-sm font-semibold text-zinc-200 truncate">{match.home}</span>
        </div>
        {pred?.top_scores?.[0] && (
          <span className="font-mono text-sm font-black text-brand-light bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-lg shrink-0 mx-2">
            {pred.top_scores[0].score}
          </span>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {match.away_crest && <img src={match.away_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
          <span className="text-sm font-semibold text-zinc-200 truncate">{match.away}</span>
        </div>
      </div>
      {homeProb && (
        <>
          <ProbBar home={parseFloat(homeProb)} draw={parseFloat(drawProb)} away={parseFloat(awayProb)} />
          <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
            <span>{homeProb}%</span>
            <span className={hasOdds ? "" : "text-brand-light/60"}>
              {hasOdds ? `Nul ${drawProb}%` : `Modèle · Nul ${drawProb}%`}
            </span>
            <span>{awayProb}%</span>
          </div>
        </>
      )}
      {!homeProb && !hasOdds && (
        <p className="text-[10px] text-zinc-700">Cotes non disponibles</p>
      )}
    </button>
  );
}

function TeamWCRecord({ match, side }) {
  // Trouve les résultats de cette équipe dans les matchs passés du tournoi
  const teamName = side === "home" ? match.home : match.away;
  const crest = side === "home" ? match.home_crest : match.away_crest;

  return (
    <div className="text-center">
      {crest && <img src={crest} alt="" className="w-12 h-12 object-contain mx-auto mb-1" />}
      <p className="text-sm font-bold text-zinc-200">{teamName}</p>
    </div>
  );
}

function WCDetailPanel({ match, allMatches }) {
  const d = match.commence ? new Date(match.commence) : null;
  const best = match.best_odds;
  const pred = match.wc_prediction;
  const vbs = match.wc_value_bets || [];

  // Historique WC de chaque équipe (depuis les matchs déjà joués)
  const getTeamRecord = (teamName) => {
    if (!allMatches) return null;
    const played = allMatches.filter(m =>
      m.is_finished && (m.home === teamName || m.away === teamName)
    );
    let w = 0, d2 = 0, l = 0, gf = 0, ga = 0;
    const form = [];
    for (const m of played.slice(-4)) {
      const isHome = m.home === teamName;
      const s = m.score || {};
      const tgf = isHome ? s.home : s.away;
      const tga = isHome ? s.away : s.home;
      if (tgf === null || tgf === undefined) continue;
      gf += tgf; ga += tga;
      const res = tgf > tga ? "W" : tgf === tga ? "D" : "L";
      if (res === "W") w++; else if (res === "D") d2++; else l++;
      const opp = isHome ? m.away : m.home;
      form.push({ result: res, score: `${tgf}-${tga}`, opponent: opp });
    }
    return { w, d: d2, l, gf, ga, form, played: played.length };
  };

  const homeRecord = getTeamRecord(match.home);
  const awayRecord = getTeamRecord(match.away);

  return (
    <div className="h-full overflow-y-auto p-5">
      {/* Header */}
      <div className="text-center mb-5">
        {d && <p className="text-xs text-zinc-600 mb-3">
          {d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })} à {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>}
        <div className="flex items-center justify-center gap-4">
          <div className="text-center flex-1">
            {match.home_crest && <img src={match.home_crest} alt="" className="w-12 h-12 object-contain mx-auto mb-1" />}
            <p className="text-sm font-bold text-zinc-200">{match.home}</p>
            {pred && <p className="text-[10px] text-zinc-600 mt-0.5">Att {pred.home_attack} · Déf {pred.home_defense}</p>}
            {homeRecord && homeRecord.played > 0 && (
              <p className="text-[11px] font-semibold mt-1">
                <span className="text-success">{homeRecord.w}V</span>
                <span className="text-zinc-500 mx-1">{homeRecord.d}N</span>
                <span className="text-danger">{homeRecord.l}D</span>
                <span className="text-zinc-600 ml-1">· {homeRecord.gf} buts</span>
              </p>
            )}
          </div>
          <span className="text-xl font-black text-zinc-700">VS</span>
          <div className="text-center flex-1">
            {match.away_crest && <img src={match.away_crest} alt="" className="w-12 h-12 object-contain mx-auto mb-1" />}
            <p className="text-sm font-bold text-zinc-200">{match.away}</p>
            {pred && <p className="text-[10px] text-zinc-600 mt-0.5">Att {pred.away_attack} · Déf {pred.away_defense}</p>}
            {awayRecord && awayRecord.played > 0 && (
              <p className="text-[11px] font-semibold mt-1">
                <span className="text-success">{awayRecord.w}V</span>
                <span className="text-zinc-500 mx-1">{awayRecord.d}N</span>
                <span className="text-danger">{awayRecord.l}D</span>
                <span className="text-zinc-600 ml-1">· {awayRecord.gf} buts</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Value bets */}
      {vbs.length > 0 && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-success" />
            <span className="text-xs font-bold text-success uppercase tracking-wider">Value bets détectés</span>
          </div>
          <div className="space-y-2">
            {vbs.map((vb, i) => (
              <div key={i} className="flex items-center justify-between bg-surface-1 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    {vb.type === "home" ? match.home : vb.type === "away" ? match.away : "Match nul"}
                  </p>
                  <p className="text-[11px] text-zinc-500">Modèle {vb.model_prob}% vs book {vb.implied_prob}%</p>
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

      {/* Poisson WC prediction */}
      {pred ? (
        <div className="mb-5">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Modèle Poisson WC</p>
          <p className="text-[10px] text-zinc-600 mb-3">
            Calculé sur {pred.home_played} matchs ({match.home}) · {pred.away_played} matchs ({match.away})
          </p>
          <ProbBar home={pred.home_win * 100} draw={pred.draw * 100} away={pred.away_win * 100} />
          <div className="grid grid-cols-3 mt-3 text-center">
            {[
              { label: match.home_tla || match.home, prob: (pred.home_win * 100).toFixed(1), lambda: pred.lambda_home },
              { label: "Nul", prob: (pred.draw * 100).toFixed(1), lambda: null },
              { label: match.away_tla || match.away, prob: (pred.away_win * 100).toFixed(1), lambda: pred.lambda_away },
            ].map(item => (
              <div key={item.label}>
                <p className="text-2xl font-black text-zinc-100">{item.prob}%</p>
                <p className="text-[11px] text-zinc-500 truncate px-1">{item.label}</p>
                {item.lambda && <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">λ={item.lambda}</p>}
              </div>
            ))}
          </div>

          {/* Top scores */}
          <div className="grid grid-cols-5 gap-1.5 mt-4">
            {pred.top_scores?.map((s, i) => (
              <div key={i} className={`rounded-lg py-2 text-center ${i === 0 ? "bg-brand/10 border border-brand/20" : "bg-surface-2 border border-surface-3"}`}>
                <p className={`text-sm font-bold font-mono ${i === 0 ? "text-brand-light" : "text-zinc-300"}`}>{s.score}</p>
                <p className="text-[10px] text-zinc-600">{s.prob}%</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-surface-2 rounded-xl p-3 border border-surface-3">
              <p className="text-[11px] text-zinc-500">Over 2.5</p>
              <p className="text-xl font-bold text-zinc-100">{(pred.over_25 * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3 border border-surface-3">
              <p className="text-[11px] text-zinc-500">BTTS Oui</p>
              <p className="text-xl font-bold text-zinc-100">{(pred.btts_yes * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 mb-4 text-center">
          <p className="text-[11px] text-zinc-500">Pas assez de matchs WC joués pour calculer une prédiction</p>
        </div>
      )}

      {/* Bookmakers */}
      {best?.home && (
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Cotes ({match.bookmakers_count} books)</p>
          <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
            <div className="grid grid-cols-[1fr_50px_50px_50px] text-[10px] font-semibold text-zinc-600 uppercase px-4 py-2 border-b border-surface-3">
              <span>Book</span><span className="text-center">1</span><span className="text-center">X</span><span className="text-center">2</span>
            </div>
            <div className="max-h-[250px] overflow-y-auto divide-y divide-surface-3/30">
              {(match.all_odds || []).map((bk, i) => (
                <div key={i} className="grid grid-cols-[1fr_50px_50px_50px] px-4 py-1.5">
                  <span className="text-xs text-zinc-500 truncate">{bk.bookmaker}</span>
                  {["home","draw","away"].map(t => {
                    const v = bk[t];
                    const isBest = v === best[t]?.odds;
                    return <span key={t} className={`text-center font-mono text-xs ${isBest ? "text-success font-bold" : "text-zinc-400"}`}>{v?.toFixed(2) || "–"}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────

export default function PredictionsSection() {
  const [tab, setTab] = useState("wc");
  const [predictions, setPredictions] = useState([]);
  const [wcMatches, setWcMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyValueBets, setOnlyValueBets] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchUpcomingAll().then(d => (d.predictions || []).filter(p => p.prediction)).catch(() => []),
      apiFetch("/api/worldcup/matches").then(d => (d.matches || []).filter(m => !m.is_finished)).catch(() => []),
    ]).then(([preds, wc]) => {
      setPredictions(preds);
      setWcMatches(wc);
    }).finally(() => setLoading(false));
  }, []);

  const filteredClub = useMemo(() => predictions.filter(p => {
    if (onlyValueBets && !p.value_bets?.length) return false;
    if (search) {
      const s = search.toLowerCase();
      return p.match.home.toLowerCase().includes(s) || p.match.away.toLowerCase().includes(s);
    }
    return true;
  }), [predictions, search, onlyValueBets]);

  const filteredWC = useMemo(() => wcMatches.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.home.toLowerCase().includes(s) || m.away.toLowerCase().includes(s);
  }), [wcMatches, search]);

  const vbCount = predictions.filter(p => p.value_bets?.length > 0).length;
  const isWC = tab === "wc";

  return (
    <div className="flex h-[calc(100vh-96px)]">
      {/* Left list */}
      <div className="w-[320px] border-r border-surface-3 flex flex-col bg-surface-1">
        <div className="px-4 pt-3 pb-2 border-b border-surface-3">
          {/* Tabs */}
          <div className="flex gap-1 mb-2">
            <button onClick={() => { setTab("wc"); setSelected(null); }}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${tab === "wc" ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-300"}`}>
              World Cup
            </button>
            <button onClick={() => { setTab("clubs"); setSelected(null); }}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1 ${tab === "clubs" ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-300"}`}>
              Clubs {vbCount > 0 && <span className={`text-[10px] px-1 rounded ${tab === "clubs" ? "bg-success/10 text-success" : "text-success"}`}>{vbCount}vb</span>}
            </button>
          </div>

          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Rechercher une équipe..."
              className="w-full bg-surface-3 border border-surface-4 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand" />
          </div>

          {tab === "clubs" && (
            <button onClick={() => setOnlyValueBets(v => !v)}
              className={`w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md transition-all ${onlyValueBets ? "bg-success/10 text-success" : "bg-surface-3 text-zinc-500 hover:text-zinc-300"}`}>
              <Zap size={11} /> Value bets uniquement
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>}

          {!loading && isWC && filteredWC.length === 0 && (
            <p className="text-center text-xs text-zinc-600 py-10">{search ? "Aucun match WC trouvé" : "Aucun match WC à venir"}</p>
          )}
          {!loading && isWC && filteredWC.map(m => (
            <WCMatchRow key={m.id} match={m}
              isSelected={selected?.id === m.id}
              onClick={() => setSelected(m)} />
          ))}

          {!loading && !isWC && filteredClub.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-zinc-600 py-4">
                {search ? `Aucun club "${search}" trouvé` : "Aucun match de club disponible"}
              </p>
              <p className="text-[11px] text-zinc-700">Les matchs WC sont dans l'onglet World Cup</p>
            </div>
          )}
          {!loading && !isWC && filteredClub.map((p, i) => (
            <MatchRow key={p.match.id || i} p={p}
              isSelected={selected?.match?.id === p.match.id}
              onClick={() => setSelected(p)} />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          isWC
            ? <WCDetailPanel match={selected} allMatches={wcMatches} />
            : <DetailPanel p={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 flex items-center justify-center">
              <TrendingUp size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-semibold text-zinc-500">Sélectionne un match</p>
            <p className="text-xs text-zinc-700">
              {isWC ? "cotes · probas implicites · bookmakers" : "probabilités · value bets · forme · H2H"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
