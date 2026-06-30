"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Radio, ChevronRight, ChevronLeft, Loader2, Users, BarChart2, AlignLeft } from "lucide-react";
import { fetchFixtureDetails } from "@/lib/api";

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const STAGE_LABEL = {
  GROUP_STAGE: "Phase de groupes",
  ROUND_OF_32: "Huitièmes",
  ROUND_OF_16: "Huitièmes",
  QUARTER_FINALS: "Quarts",
  SEMI_FINALS: "Demis",
  THIRD_PLACE: "3e place",
  FINAL: "Finale",
};

const POS_LABEL = { Goalkeeper: "Gardiens", Defence: "Défenseurs", Midfield: "Milieux", Offence: "Attaquants" };

const EVENT_ICONS = {
  Goal: "⚽",
  "Own Goal": "⚽",
  Card: null,
  subst: "↔",
  Var: "📺",
};

// ─── COMPOSANTS UTILITAIRES ───────────────────────────────

function ProbBar({ home, draw, away }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden">
      <div style={{ width: `${home}%` }} className="bg-brand transition-all" />
      <div style={{ width: `${draw}%` }} className="bg-zinc-600 transition-all" />
      <div style={{ width: `${away}%` }} className="bg-danger transition-all" />
    </div>
  );
}

function StatBar({ label, homeVal, awayVal, homeTeam, awayTeam, isPercent }) {
  const parseNum = (v) => {
    if (v === null || v === undefined) return 0;
    return parseInt(String(v).replace("%", "")) || 0;
  };
  const h = parseNum(homeVal);
  const a = parseNum(awayVal);
  const total = h + a || 1;
  const hPct = Math.round((h / total) * 100);
  const aPct = 100 - hPct;

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="font-mono font-bold text-zinc-200">{homeVal ?? "-"}</span>
        <span className="text-zinc-500 text-[11px]">{label}</span>
        <span className="font-mono font-bold text-zinc-200">{awayVal ?? "-"}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-3">
        <div style={{ width: `${hPct}%` }} className="bg-brand rounded-l-full transition-all" />
        <div style={{ width: `${aPct}%` }} className="bg-danger rounded-r-full transition-all" />
      </div>
    </div>
  );
}

// ─── LINEUP FORMATION GRID ────────────────────────────────

function FormationGrid({ lineup }) {
  if (!lineup?.startXI?.length) return null;

  // Groupe les joueurs par ligne de la grille (ex: "1:1", "2:1", ...)
  const rows = {};
  for (const p of lineup.startXI) {
    const row = p.grid ? p.grid.split(":")[0] : "0";
    if (!rows[row]) rows[row] = [];
    rows[row].push(p);
  }

  const rowKeys = Object.keys(rows).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="bg-[#1a3a1a] rounded-xl p-3 border border-[#2a5a2a]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {lineup.team_logo && <img src={lineup.team_logo} alt="" className="w-5 h-5 object-contain" />}
          <span className="text-xs font-bold text-zinc-200">{lineup.team}</span>
        </div>
        <span className="text-xs text-zinc-500 font-mono">{lineup.formation}</span>
      </div>
      <div className="space-y-2">
        {rowKeys.map((row) => (
          <div key={row} className="flex justify-around">
            {rows[row].map((p) => (
              <div key={p.name} className="text-center w-14">
                <div className="w-8 h-8 rounded-full bg-[#2a5a2a] border border-[#4a8a4a] flex items-center justify-center mx-auto mb-0.5">
                  <span className="text-[11px] font-bold text-white">{p.number}</span>
                </div>
                <p className="text-[9px] text-zinc-300 leading-tight truncate">{p.name.split(" ").pop()}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      {lineup.coach && (
        <p className="text-[10px] text-zinc-600 mt-2 text-center">Coach : {lineup.coach}</p>
      )}
    </div>
  );
}

// ─── MATCH ROW ────────────────────────────────────────────

function MatchRow({ match, isSelected, onClick }) {
  const d = match.commence ? new Date(match.commence) : null;
  const best = match.best_odds;
  const score = match.score;
  const hasScore = score?.home !== null && score?.home !== undefined;
  const homeWon = score?.winner === "HOME_TEAM";
  const awayWon = score?.winner === "AWAY_TEAM";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-surface-3/50 transition-all ${
        isSelected ? "bg-brand/5 border-l-2 border-l-brand" : "hover:bg-surface-2/50 border-l-2 border-l-transparent"
      }`}
    >
      {/* Status line */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {match.group && <span className="text-[10px] text-zinc-600">{match.group.replace("_", " ")}</span>}
          {match.is_live && <span className="flex items-center gap-1 text-[10px] font-bold text-danger"><Radio size={8} className="animate-pulse" /> LIVE</span>}
          {match.is_finished && !match.is_live && <span className="text-[10px] text-zinc-500">Final</span>}
          {!match.is_finished && !match.is_live && d && (
            <span className="text-[10px] text-zinc-600">
              {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <ChevronRight size={12} className={`shrink-0 ${isSelected ? "text-brand" : "text-zinc-700"}`} />
      </div>

      {hasScore ? (
        /* Finished / Live */
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold truncate flex-1 mr-3 ${homeWon ? "text-zinc-100" : "text-zinc-500"}`}>{match.home}</span>
            <span className={`font-mono text-lg font-bold shrink-0 ${homeWon ? "text-zinc-100" : "text-zinc-400"}`}>{score.home}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold truncate flex-1 mr-3 ${awayWon ? "text-zinc-100" : "text-zinc-500"}`}>{match.away}</span>
            <span className={`font-mono text-lg font-bold shrink-0 ${awayWon ? "text-zinc-100" : "text-zinc-400"}`}>{score.away}</span>
          </div>
          {score.ht_home !== null && score.ht_home !== undefined && (
            <p className="text-[10px] text-zinc-600 pt-0.5">MT {score.ht_home}-{score.ht_away}</p>
          )}
        </div>
      ) : (
        /* Upcoming */
        <div>
          <div className="space-y-1 mb-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-300 truncate flex-1 mr-2">{match.home}</span>
              {best?.home && <span className="font-mono text-xs text-zinc-500 shrink-0">{best.home.odds?.toFixed(2)}</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-300 truncate flex-1 mr-2">{match.away}</span>
              {best?.away && <span className="font-mono text-xs text-zinc-500 shrink-0">{best.away.odds?.toFixed(2)}</span>}
            </div>
          </div>
          {best?.home && (
            <>
              <ProbBar home={best.home.prob} draw={best.draw.prob} away={best.away.prob} />
              <div className="flex justify-between mt-1 text-[10px] text-zinc-600">
                <span>{best.home.prob}%</span><span>Nul {best.draw.prob}%</span><span>{best.away.prob}%</span>
              </div>
            </>
          )}
        </div>
      )}
    </button>
  );
}

// ─── TEAM PANEL ───────────────────────────────────────────

function TeamPanel({ teamId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/worldcup/team/${teamId}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={20} className="text-zinc-600 animate-spin" /></div>;
  if (!data) return null;

  const byPos = (data.squad || []).reduce((acc, p) => {
    const pos = p.position || "Other";
    if (!acc[pos]) acc[pos] = [];
    acc[pos].push(p);
    return acc;
  }, {});

  return (
    <div className="p-6 overflow-y-auto h-full">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-5">
        <ChevronLeft size={14} /> Retour
      </button>
      <div className="flex items-center gap-4 mb-6">
        {data.crest && <img src={data.crest} alt={data.name} className="w-16 h-16 object-contain" />}
        <div>
          <h2 className="text-xl font-bold text-zinc-100">{data.name}</h2>
          <p className="text-sm text-zinc-500">{data.area}</p>
        </div>
      </div>
      {data.coach?.name && (
        <div className="bg-surface-2 rounded-xl p-4 border border-surface-3 mb-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Sélectionneur</p>
          <p className="text-sm font-semibold text-zinc-200">{data.coach.name}</p>
        </div>
      )}
      {data.matches?.filter(m => m.score).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Résultats WC</p>
          <div className="space-y-2">
            {data.matches.map((m, i) => (
              <div key={i} className="bg-surface-2 rounded-lg px-4 py-2.5 border border-surface-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">{m.stage ? STAGE_LABEL[m.stage] || m.stage : ""}</p>
                  <p className="text-sm text-zinc-300 mt-0.5"><span className="text-zinc-500 text-xs mr-1">{m.venue}</span>{m.opponent}</p>
                </div>
                <div className="text-right">
                  {m.score ? (
                    <>
                      <p className="font-mono font-bold text-zinc-100">{m.score}</p>
                      <span className={`text-[11px] font-bold ${m.result === "W" ? "text-success" : m.result === "D" ? "text-warning" : "text-danger"}`}>
                        {m.result === "W" ? "Victoire" : m.result === "D" ? "Nul" : "Défaite"}
                      </span>
                    </>
                  ) : <span className="text-xs text-zinc-600">{m.status}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          <Users size={12} className="inline mr-1.5" />Effectif ({data.squad?.length})
        </p>
        {["Goalkeeper", "Defence", "Midfield", "Offence"].filter(pos => byPos[pos]?.length).map(pos => (
          <div key={pos} className="mb-4">
            <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">{POS_LABEL[pos]}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {byPos[pos].map(p => (
                <div key={p.id} className="bg-surface-2 rounded-lg px-3 py-2 border border-surface-3">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{p.name}</p>
                  {p.dob && <p className="text-[10px] text-zinc-600 mt-0.5">{new Date().getFullYear() - new Date(p.dob).getFullYear()} ans</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MATCH DETAIL PANEL ───────────────────────────────────

const STAT_ROWS = [
  { label: "Possession", key: "Ball Possession" },
  { label: "Tirs", key: "Total Shots" },
  { label: "Tirs cadrés", key: "Shots on Goal" },
  { label: "Corners", key: "Corner Kicks" },
  { label: "Fautes", key: "Fouls" },
  { label: "Cartons jaunes", key: "Yellow Cards" },
  { label: "Cartons rouges", key: "Red Cards" },
  { label: "Hors-jeu", key: "Offsides" },
  { label: "Arrêts gardien", key: "Goalkeeper Saves" },
  { label: "Passes précises", key: "Passes accurate" },
];

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function MatchDetailPanel({ match, onTeamClick }) {
  const [tab, setTab] = useState("overview");
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const score = match.score;
  const best = match.best_odds;
  const hasScore = score?.home !== null && score?.home !== undefined;
  const hasOdds = !!best?.home?.odds;
  const d = match.commence ? new Date(match.commence) : null;

  // Stats/compos disponibles seulement pour les matchs live ou d'aujourd'hui (plan gratuit)
  const canFetchLiveData = match.is_live || isToday(match.commence);

  const loadDetails = useCallback(async () => {
    if (details || loadingDetails || !canFetchLiveData) return;
    setLoadingDetails(true);
    const result = await fetchFixtureDetails(match.commence, match.home, match.away);
    setDetails(result);
    setLoadingDetails(false);
  }, [match, details, loadingDetails, canFetchLiveData]);

  useEffect(() => {
    setDetails(null);
    setLoadingDetails(false);
    setTab("overview");
  }, [match.id]);

  useEffect(() => {
    if (tab === "stats" || tab === "lineups" || tab === "events") {
      loadDetails();
    }
  }, [tab, loadDetails]);

  const homeStats = details?.stats ? Object.values(details.stats)[0] : null;
  const awayStats = details?.stats ? Object.values(details.stats)[1] : null;
  const homeTeamName = details?.stats ? Object.keys(details.stats)[0] : match.home;
  const awayTeamName = details?.stats ? Object.keys(details.stats)[1] : match.away;

  return (
    <div className="flex flex-col h-full">
      {/* Score header */}
      <div className="p-6 border-b border-surface-3">
        {match.is_live && (
          <div className="flex items-center gap-1.5 text-danger text-xs font-bold mb-2 animate-pulse">
            <Radio size={12} /> Match en cours
          </div>
        )}
        <p className="text-xs text-zinc-600 text-center mb-3">
          {match.stage ? STAGE_LABEL[match.stage] || match.stage : ""}
          {match.group ? ` · ${match.group.replace("_", " ")}` : ""}
        </p>

        <div className="flex items-center justify-center gap-4">
          <div className="text-center flex-1">
            {match.home_crest && <img src={match.home_crest} alt={match.home} className="w-12 h-12 object-contain mx-auto mb-1.5" />}
            <button onClick={() => match.home_id && onTeamClick(match.home_id)}
              className={`text-sm font-bold hover:text-brand-light transition-colors ${hasScore && score.winner === "HOME_TEAM" ? "text-zinc-100" : hasScore ? "text-zinc-400" : "text-zinc-200"}`}>
              {match.home}
            </button>
          </div>

          <div className="text-center shrink-0">
            {hasScore ? (
              <>
                <p className="text-4xl font-bold font-mono text-zinc-100 leading-none">
                  {score.home}<span className="text-zinc-600 mx-2">-</span>{score.away}
                </p>
                {score.ht_home !== null && score.ht_home !== undefined && (
                  <p className="text-xs text-zinc-600 mt-1.5">Mi-temps : {score.ht_home}-{score.ht_away}</p>
                )}
                <p className="text-xs text-zinc-500 mt-1">{match.status}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-zinc-600">VS</p>
                {d && <p className="text-xs text-zinc-500 mt-1">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </>
            )}
          </div>

          <div className="text-center flex-1">
            {match.away_crest && <img src={match.away_crest} alt={match.away} className="w-12 h-12 object-contain mx-auto mb-1.5" />}
            <button onClick={() => match.away_id && onTeamClick(match.away_id)}
              className={`text-sm font-bold hover:text-brand-light transition-colors ${hasScore && score.winner === "AWAY_TEAM" ? "text-zinc-100" : hasScore ? "text-zinc-400" : "text-zinc-200"}`}>
              {match.away}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-1">
        {[
          ["overview", "Aperçu"],
          ["stats", "Statistiques"],
          ["lineups", "Compositions"],
          ["events", "Événements"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all ${tab === id ? "text-brand-light border-b-2 border-brand" : "text-zinc-600 hover:text-zinc-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "overview" && (
          <div>
            {hasOdds && (
              <>
                <div className="mb-5">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Probabilités implicites</p>
                  <ProbBar home={best.home.prob} draw={best.draw.prob} away={best.away.prob} />
                  <div className="grid grid-cols-3 mt-3 text-center">
                    {[
                      { label: match.home_tla || match.home, prob: best.home.prob, odds: best.home.odds, bk: best.home.bookmaker },
                      { label: "Nul", prob: best.draw.prob, odds: best.draw.odds, bk: best.draw.bookmaker },
                      { label: match.away_tla || match.away, prob: best.away.prob, odds: best.away.odds, bk: best.away.bookmaker },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="text-2xl font-bold text-zinc-100">{item.prob}%</div>
                        <div className="text-xs text-zinc-500 mt-0.5 truncate px-1">{item.label}</div>
                        <div className="font-mono text-sm text-brand-light mt-1">{item.odds?.toFixed(2)}</div>
                        <div className="text-[10px] text-zinc-600 truncate px-1">{item.bk}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-surface-3">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{match.bookmakers_count} Bookmakers</p>
                  <div className="grid grid-cols-4 text-[10px] text-zinc-600 uppercase font-semibold pb-2 border-b border-surface-3 mb-1">
                    <span>Book</span><span className="text-right">1</span><span className="text-right">X</span><span className="text-right">2</span>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto">
                    {(match.all_odds || []).map((bk, i) => (
                      <div key={i} className="grid grid-cols-4 py-1.5 border-b border-surface-3/30">
                        <span className="text-[11px] text-zinc-500 truncate pr-1">{bk.bookmaker}</span>
                        {["home", "draw", "away"].map((type) => {
                          const val = bk[type];
                          const isBest = val === best[type]?.odds;
                          return <span key={type} className={`text-right font-mono text-xs ${isBest ? "text-success font-bold" : "text-zinc-400"}`}>{val?.toFixed(2) || "-"}</span>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {!hasOdds && hasScore && (
              <div className="text-center text-xs text-zinc-600 py-6">
                Match terminé · clique sur une équipe pour voir son profil
              </div>
            )}
            {!hasOdds && !hasScore && (
              <div className="text-center text-xs text-zinc-600 py-6">
                Cotes non disponibles pour ce match
              </div>
            )}
          </div>
        )}

        {(tab === "stats" || tab === "lineups" || tab === "events") && (
          <div>
            {!canFetchLiveData && (
              <div className="text-center py-10">
                <p className="text-sm text-zinc-500">Données en direct uniquement</p>
                <p className="text-xs text-zinc-600 mt-1 max-w-xs mx-auto">
                  Stats, compositions et événements sont disponibles pour les matchs<br/>
                  <span className="text-brand-light">en cours ou programmés aujourd'hui</span>
                </p>
              </div>
            )}

            {canFetchLiveData && loadingDetails && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={20} className="text-zinc-600 animate-spin" />
                <p className="text-xs text-zinc-600">Chargement depuis API-Football...</p>
              </div>
            )}

            {canFetchLiveData && !loadingDetails && !details && (
              <div className="text-center py-10">
                <p className="text-sm text-zinc-500">Données non disponibles</p>
                <p className="text-xs text-zinc-700 mt-1">Match introuvable dans API-Football</p>
              </div>
            )}

            {!loadingDetails && details && tab === "stats" && (
              <div>
                <div className="flex justify-between text-xs font-semibold mb-4">
                  <span className="text-brand-light truncate">{homeTeamName}</span>
                  <span className="text-zinc-600">Statistiques</span>
                  <span className="text-danger truncate text-right">{awayTeamName}</span>
                </div>
                {STAT_ROWS.map(({ label, key }) => {
                  if (!homeStats?.[key] && !awayStats?.[key]) return null;
                  return (
                    <StatBar
                      key={key}
                      label={label}
                      homeVal={homeStats?.[key]}
                      awayVal={awayStats?.[key]}
                    />
                  );
                })}
              </div>
            )}

            {!loadingDetails && details && tab === "lineups" && (
              <div className="space-y-4">
                {details.lineups?.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-6">Compositions non encore disponibles</p>
                )}
                {details.lineups?.map((lineup) => (
                  <FormationGrid key={lineup.team} lineup={lineup} />
                ))}
                {/* Remplaçants */}
                {details.lineups?.map((lineup) => (
                  lineup.substitutes?.length > 0 && (
                    <div key={`subs-${lineup.team}`} className="bg-surface-2 rounded-xl p-4 border border-surface-3">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{lineup.team} — Remplaçants</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {lineup.substitutes.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-600 font-mono w-5 text-right">{p.number}</span>
                            <span className="text-xs text-zinc-400 truncate">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {!loadingDetails && details && tab === "events" && (
              <div>
                {details.events?.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-6">Aucun événement</p>
                )}
                <div className="space-y-1">
                  {details.events?.map((e, i) => {
                    const isHome = e.team === match.home || (details.lineups?.[0]?.team === e.team);
                    const icon = e.type === "Goal" ? "⚽" : e.type === "Card" ? (e.detail?.includes("Yellow") ? "🟨" : "🟥") : e.type === "subst" ? "↔" : "•";
                    return (
                      <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${i % 2 === 0 ? "bg-surface-2/50" : ""}`}>
                        <span className="text-[11px] font-mono text-zinc-500 w-8 shrink-0">{e.minute}'</span>
                        {isHome ? (
                          <>
                            <span className="text-sm">{icon}</span>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-zinc-200">{e.player}</p>
                              {e.assist && <p className="text-[10px] text-zinc-600">Passe : {e.assist}</p>}
                              {e.detail && e.type !== "Goal" && <p className="text-[10px] text-zinc-600">{e.detail}</p>}
                            </div>
                            <span className="text-[10px] text-zinc-600 shrink-0">{match.home_tla}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-zinc-600 shrink-0">{match.away_tla}</span>
                            <div className="flex-1 text-right">
                              <p className="text-xs font-semibold text-zinc-200">{e.player}</p>
                              {e.assist && <p className="text-[10px] text-zinc-600">Passe : {e.assist}</p>}
                              {e.detail && e.type !== "Goal" && <p className="text-[10px] text-zinc-600">{e.detail}</p>}
                            </div>
                            <span className="text-sm">{icon}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────

export default function WorldCupSection() {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reqRemaining, setReqRemaining] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    apiFetch("/api/worldcup/matches")
      .then((data) => {
        setMatches(data.matches || []);
        setReqRemaining(data.api_requests_remaining);
        setLoading(false);
      })
      .catch(() => { setError("Backend non disponible"); setLoading(false); });
  }, []);

  const filtered = matches.filter(m => {
    if (filter === "live") return m.is_live;
    if (filter === "upcoming") return !m.is_finished && !m.is_live;
    if (filter === "finished") return m.is_finished;
    return true;
  });

  const liveCount = matches.filter(m => m.is_live).length;
  const finishedCount = matches.filter(m => m.is_finished).length;

  return (
    <div className="flex h-[calc(100vh-96px)]">
      {/* Liste matchs */}
      <div className="w-[340px] border-r border-surface-3 flex flex-col">
        <div className="px-4 py-3 border-b border-surface-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold text-zinc-200">FIFA World Cup 2026</h2>
              <p className="text-[11px] text-zinc-600">
                {matches.length} matchs · {finishedCount} joués
                {liveCount > 0 && <span className="text-danger"> · {liveCount} live</span>}
              </p>
            </div>
            {reqRemaining && <span className="text-[10px] text-zinc-700">{reqRemaining} req</span>}
          </div>
          <div className="flex gap-1">
            {[["all","Tous"],["upcoming","À venir"],["finished","Résultats"],["live","Live"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${filter === val ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-400"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-16"><Loader2 size={20} className="text-zinc-600 animate-spin" /></div>}
          {error && <p className="text-center text-sm text-danger py-8">{error}</p>}
          {!loading && !error && filtered.map(m => (
            <MatchRow key={m.id} match={m} isSelected={selected?.id === m.id && !selectedTeamId}
              onClick={() => { setSelected(m); setSelectedTeamId(null); }} />
          ))}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-center text-xs text-zinc-600 py-12">Aucun match</p>
          )}
        </div>
      </div>

      {/* Panneau droit */}
      <div className="flex-1 overflow-hidden">
        {selectedTeamId ? (
          <TeamPanel teamId={selectedTeamId} onBack={() => setSelectedTeamId(null)} />
        ) : selected ? (
          <MatchDetailPanel match={selected} onTeamClick={setSelectedTeamId} />
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-sm text-zinc-500">Sélectionne un match</p>
              <p className="text-xs text-zinc-700 mt-1">score · stats · compositions · événements</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
