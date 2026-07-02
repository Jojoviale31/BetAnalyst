"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Radio, ChevronLeft, Loader2, Users, Search, X, Goal, RectangleVertical, ArrowLeftRight, MonitorPlay } from "lucide-react";
import { fetchFixtureDetails, fetchWCPlayer, fetchFixturePlayers } from "@/lib/api";

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const STAGE_LABEL = {
  GROUP_STAGE: "Phase de groupes",
  LAST_32: "Huitièmes de finale",
  ROUND_OF_32: "Huitièmes de finale",
  ROUND_OF_16: "Huitièmes de finale",
  QUARTER_FINALS: "Quarts de finale",
  SEMI_FINALS: "Demi-finales",
  THIRD_PLACE: "3e place",
  FINAL: "Finale",
};

const POS_ORDER = ["Goalkeeper", "Defence", "Midfield", "Offence"];
const POS_LABEL = { Goalkeeper: "G", Defence: "D", Midfield: "M", Offence: "A" };
const POS_COLOR = { Goalkeeper: "#f59e0b", Defence: "#6366f1", Midfield: "#22c55e", Offence: "#ef4444" };

function isRecent(dateStr) {
  if (!dateStr) return false;
  // Autorise stats/compos pour les 48h passées et les matchs à venir
  return (new Date() - new Date(dateStr)) / (1000 * 60 * 60) <= 48;
}

// ─── STAT BAR ─────────────────────────────────────────────

function StatRow({ label, h, a }) {
  const parseV = (v) => parseInt(String(v ?? 0).replace("%", "")) || 0;
  const hv = parseV(h), av = parseV(a), total = hv + av || 1;
  const hPct = Math.round(hv / total * 100);
  return (
    <div className="grid grid-cols-[48px_1fr_48px] gap-2 items-center py-1.5">
      <span className="text-right text-xs font-mono font-semibold text-zinc-200">{h ?? "–"}</span>
      <div className="relative h-1 bg-surface-3 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-brand rounded-full transition-all duration-500" style={{ width: `${hPct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-zinc-200">{a ?? "–"}</span>
    </div>
  );
}

// ─── FORMATION PITCH ──────────────────────────────────────

function PitchLineup({ lineup, onPlayerClick }) {
  if (!lineup?.startXI?.length) return (
    <div className="flex items-center justify-center h-40 text-xs text-zinc-600">Composition non disponible</div>
  );

  const rows = {};
  for (const p of lineup.startXI) {
    const row = p.grid ? p.grid.split(":")[0] : "0";
    if (!rows[row]) rows[row] = [];
    rows[row].push(p);
  }
  const rowKeys = Object.keys(rows).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="rounded-xl overflow-hidden border border-[#2a5a2a]">
      <div className="bg-[#166534]/30 px-3 py-2 flex items-center justify-between border-b border-[#2a5a2a]">
        <div className="flex items-center gap-2">
          {lineup.team_logo && <img src={lineup.team_logo} alt="" className="w-5 h-5 object-contain" />}
          <span className="text-xs font-bold text-zinc-200">{lineup.team}</span>
        </div>
        <span className="text-xs font-mono text-zinc-500">{lineup.formation}</span>
      </div>
      <div className="bg-gradient-to-b from-[#14532d]/40 to-[#166534]/20 p-3 space-y-3">
        {rowKeys.map((row) => (
          <div key={row} className="flex justify-around items-center">
            {rows[row].map((p) => (
              <button
                key={p.name}
                onClick={() => p.id && onPlayerClick?.(p.id, p.name)}
                className="flex flex-col items-center gap-1 w-14 group"
              >
                <div className="w-9 h-9 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center shadow-lg group-hover:border-brand group-hover:bg-brand/20 transition-all">
                  <span className="text-xs font-bold text-white">{p.number}</span>
                </div>
                <span className="text-[9px] text-zinc-300 text-center leading-tight truncate w-full group-hover:text-brand-light transition-colors">
                  {p.name.split(" ").slice(-1)[0]}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {lineup.coach && (
        <div className="bg-[#166534]/10 px-3 py-1.5 border-t border-[#2a5a2a] text-[10px] text-zinc-500">
          Coach : {lineup.coach}
        </div>
      )}
    </div>
  );
}

// ─── PLAYER PANEL ─────────────────────────────────────────

function PlayerPanel({ playerId, playerName, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchWCPlayer(playerId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [playerId]);

  const pos = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MIL", Attacker: "ATT" };

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-surface-1 border-b border-surface-3 px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-500 hover:text-zinc-200 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-zinc-200">{playerName}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-12 text-zinc-600 text-sm">Joueur introuvable</div>
      )}

      {!loading && data && (
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-4">
            {data.photo && (
              <img src={data.photo} alt={data.name} className="w-20 h-20 rounded-2xl object-cover bg-surface-3 border border-surface-3" />
            )}
            <div>
              <p className="text-lg font-black text-zinc-100">{data.firstname} {data.lastname}</p>
              <p className="text-sm text-zinc-500">{data.nationality}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {data.position && (
                  <span className="text-[10px] font-bold bg-brand/10 text-brand-light px-2 py-0.5 rounded">
                    {pos[data.position] || data.position}
                  </span>
                )}
                {data.age && <span className="text-[11px] text-zinc-500">{data.age} ans</span>}
                {data.height && <span className="text-[11px] text-zinc-500">{data.height} cm</span>}
              </div>
            </div>
          </div>

          {/* WC 2026 stats */}
          {data.wc_stats && (
            <div className="bg-brand/5 border border-brand/20 rounded-xl p-4">
              <p className="text-[10px] font-bold text-brand-light uppercase tracking-wider mb-3">Coupe du Monde 2026</p>
              <div className="grid grid-cols-3 text-center">
                {[
                  { label: "Matchs", value: data.wc_stats.played },
                  { label: "Buts", value: data.wc_stats.goals ?? 0 },
                  { label: "Passes D.", value: data.wc_stats.assists ?? 0 },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-2xl font-black text-zinc-100 font-mono">{s.value ?? "–"}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Club */}
          {data.club && (
            <div className="bg-surface-2 rounded-xl border border-surface-3 p-4">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Club (saison 2024)</p>
              <div className="flex items-center gap-3 mb-3">
                {data.club_logo && <img src={data.club_logo} alt={data.club} className="w-8 h-8 object-contain" />}
                <div>
                  <p className="text-sm font-bold text-zinc-200">{data.club}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {data.league_flag && <img src={data.league_flag} alt="" className="h-3 rounded-sm" />}
                    <p className="text-[11px] text-zinc-500">{data.league}</p>
                  </div>
                </div>
              </div>

              {/* Club stats grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Matchs", value: data.club_stats?.appearances },
                  { label: "Minutes", value: data.club_stats?.minutes },
                  { label: "Note", value: data.club_stats?.rating ? parseFloat(data.club_stats.rating).toFixed(1) : null },
                  { label: data.position === "Goalkeeper" ? "Arrêts" : "Buts", value: data.position === "Goalkeeper" ? data.club_stats?.saves : data.club_stats?.goals },
                  { label: data.position === "Goalkeeper" ? "Encaissés" : "Passes D.", value: data.position === "Goalkeeper" ? data.club_stats?.conceded : data.club_stats?.assists },
                  { label: "Cartons J.", value: data.club_stats?.yellow },
                ].map((s, i) => (
                  <div key={i} className="bg-surface-3 rounded-lg p-2.5 text-center">
                    <p className="text-sm font-bold font-mono text-zinc-100">{s.value ?? "–"}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MATCH ROW ────────────────────────────────────────────

function MatchRow({ match, isSelected, onClick }) {
  const d = match.commence ? new Date(match.commence) : null;
  const score = match.score;
  const best = match.best_odds;
  const hasScore = score?.home !== null && score?.home !== undefined;
  const homeWon = score?.winner === "HOME_TEAM";
  const awayWon = score?.winner === "AWAY_TEAM";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left transition-all border-b border-surface-3/40 ${
        isSelected
          ? "bg-surface-3 border-l-[3px] border-l-brand"
          : "hover:bg-surface-2 border-l-[3px] border-l-transparent"
      }`}
    >
      <div className="px-3 py-2.5">
        {/* Top meta */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-600">
            {match.group
              ? match.group.replace("GROUP_", "Groupe ")
              : STAGE_LABEL[match.stage] || match.stage || ""}
          </span>
          <div className="flex items-center gap-1.5">
            {match.is_live && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-danger">
                <Radio size={8} className="animate-pulse" />LIVE
              </span>
            )}
            {match.is_finished && !match.is_live && (
              <span className="text-[10px] text-zinc-600">FT</span>
            )}
            {!match.is_finished && !match.is_live && d && (
              <span className="text-[10px] text-zinc-600">
                {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {/* Teams + scores */}
        <div className="space-y-1.5">
          {/* Home */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {match.home_crest && (
                <img src={match.home_crest} alt="" className="w-5 h-5 object-contain shrink-0" />
              )}
              <span className={`text-sm truncate ${hasScore ? (homeWon ? "font-bold text-zinc-100" : "text-zinc-500") : "font-semibold text-zinc-200"}`}>
                {match.home}
              </span>
            </div>
            {hasScore && (
              <span className={`font-mono text-sm font-bold shrink-0 ${homeWon ? "text-zinc-100" : "text-zinc-500"}`}>
                {score.home}
              </span>
            )}
            {!hasScore && (
              <div className="flex items-center gap-2 shrink-0">
                {match.wc_prediction?.top_scores?.[0] && (
                  <span className="font-mono text-xs font-bold text-brand-light bg-brand/10 px-1.5 py-0.5 rounded">
                    {match.wc_prediction.top_scores[0].score}
                  </span>
                )}
                {best?.home && <span className="font-mono text-xs text-zinc-600">{best.home.odds?.toFixed(2)}</span>}
              </div>
            )}
          </div>
          {/* Away */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {match.away_crest && (
                <img src={match.away_crest} alt="" className="w-5 h-5 object-contain shrink-0" />
              )}
              <span className={`text-sm truncate ${hasScore ? (awayWon ? "font-bold text-zinc-100" : "text-zinc-500") : "font-semibold text-zinc-200"}`}>
                {match.away}
              </span>
            </div>
            {hasScore && (
              <span className={`font-mono text-sm font-bold shrink-0 ${awayWon ? "text-zinc-100" : "text-zinc-500"}`}>
                {score.away}
              </span>
            )}
            {!hasScore && best?.away && (
              <span className="font-mono text-xs text-zinc-500 shrink-0">{best.away.odds?.toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Prob bar for upcoming */}
        {!hasScore && best?.home && (
          <div className="mt-2">
            <div className="flex h-1 rounded-full overflow-hidden">
              <div style={{ width: `${best.home.prob}%` }} className="bg-brand" />
              <div style={{ width: `${best.draw.prob}%` }} className="bg-zinc-600" />
              <div style={{ width: `${best.away.prob}%` }} className="bg-danger" />
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-zinc-600">
              <span>{best.home.prob}%</span>
              <span>{best.draw.prob}%</span>
              <span>{best.away.prob}%</span>
            </div>
          </div>
        )}

        {/* HT score */}
        {hasScore && score.ht_home !== null && score.ht_home !== undefined && (
          <p className="text-[10px] text-zinc-600 mt-1.5">MT {score.ht_home}–{score.ht_away}</p>
        )}
      </div>
    </button>
  );
}

// ─── TEAM PANEL ───────────────────────────────────────────

function TeamPanel({ teamId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/worldcup/team/${teamId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>;
  if (!data) return null;

  const byPos = (data.squad || []).reduce((acc, p) => {
    const pos = p.position || "Other";
    if (!acc[pos]) acc[pos] = [];
    acc[pos].push(p);
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-1 border-b border-surface-3 px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-500 hover:text-zinc-200 transition-colors">
          <ChevronLeft size={16} />
        </button>
        {data.crest && <img src={data.crest} alt={data.name} className="w-8 h-8 object-contain" />}
        <div>
          <h2 className="text-sm font-bold text-zinc-100">{data.name}</h2>
          <p className="text-[11px] text-zinc-500">{data.area}</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Coach */}
        {data.coach?.name && (
          <div className="flex items-center justify-between bg-surface-2 rounded-xl px-4 py-3 border border-surface-3">
            <span className="text-xs text-zinc-500">Sélectionneur</span>
            <span className="text-sm font-semibold text-zinc-200">{data.coach.name}</span>
          </div>
        )}

        {/* Results */}
        {data.matches?.some(m => m.score) && (
          <div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Résultats WC</p>
            <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
              {data.matches.filter(m => m.status !== "À venir").map((m, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? "border-t border-surface-3/50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.venue === "H" ? "bg-brand/10 text-brand-light" : "bg-surface-3 text-zinc-500"}`}>{m.venue}</span>
                    <span className="text-sm text-zinc-300">{m.opponent}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.score && <span className="font-mono text-sm font-bold text-zinc-100">{m.score}</span>}
                    {m.result && (
                      <span className={`text-[10px] font-bold w-5 h-5 rounded flex items-center justify-center ${
                        m.result === "W" ? "bg-success/10 text-success" : m.result === "D" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                      }`}>{m.result}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Squad */}
        <div>
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            <Users size={11} className="inline mr-1.5" />Effectif ({data.squad?.length})
          </p>
          {POS_ORDER.filter(pos => byPos[pos]?.length).map(pos => (
            <div key={pos} className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: POS_COLOR[pos] + "20", color: POS_COLOR[pos] }}>
                  {POS_LABEL[pos]}
                </span>
                <span className="text-[10px] text-zinc-600">{byPos[pos].length} joueurs</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {byPos[pos].map(p => (
                  <div key={p.id} className="bg-surface-2 rounded-lg px-3 py-2 border border-surface-3/50 flex items-center justify-between">
                    <span className="text-xs text-zinc-300 truncate">{p.name}</span>
                    {p.dob && <span className="text-[10px] text-zinc-600 shrink-0 ml-2">{new Date().getFullYear() - new Date(p.dob).getFullYear()}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL PANEL ─────────────────────────────────────────

const STAT_ROWS = [
  ["Possession", "Ball Possession"],
  ["Tirs", "Total Shots"],
  ["Cadrés", "Shots on Goal"],
  ["Corners", "Corner Kicks"],
  ["Fautes", "Fouls"],
  ["Hors-jeu", "Offsides"],
  ["Cartons jaunes", "Yellow Cards"],
  ["Cartons rouges", "Red Cards"],
  ["Arrêts", "Goalkeeper Saves"],
  ["Passes précises", "Passes accurate"],
];

function RatingBadge({ rating }) {
  if (!rating) return <span className="text-[11px] text-zinc-600">–</span>;
  const r = parseFloat(rating);
  const color = r >= 8.5 ? "text-amber-400 bg-amber-400/10" :
                r >= 7.5 ? "text-success bg-success/10" :
                r >= 6.5 ? "text-brand-light bg-brand/10" :
                           "text-danger bg-danger/10";
  return (
    <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${color}`}>
      {r.toFixed(1)}
    </span>
  );
}

function DetailPanel({ match, onTeamClick, onPlayerClick }) {
  const [tab, setTab] = useState("apercu");
  const [details, setDetails] = useState(null);
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const score = match.score;
  const best = match.best_odds;
  const pred = match.wc_prediction;
  const vbs = match.wc_value_bets || [];
  const hasScore = score?.home !== null && score?.home !== undefined;
  const hasOdds = !!best?.home?.odds;
  const canFetch = true; // On essaie toujours — l'API retourne null si non dispo
  const d = match.commence ? new Date(match.commence) : null;
  const predictedScore = pred?.top_scores?.[0];

  useEffect(() => {
    setDetails(null); setPlayers(null); setLoading(false); setLoadingPlayers(false); setTab("apercu");
  }, [match.id]);

  const loadDetails = useCallback(async () => {
    if (details || loading || !canFetch) return;
    setLoading(true);
    const r = await fetchFixtureDetails(match.commence, match.home, match.away);
    setDetails(r);
    setLoading(false);
  }, [match, details, loading, canFetch]);

  const loadPlayers = useCallback(async () => {
    if (loadingPlayers || !canFetch) return;
    setLoadingPlayers(true);
    const r = await fetchFixturePlayers(match.commence, match.home, match.away);
    setPlayers(r);
    setLoadingPlayers(false);
  }, [match, loadingPlayers, canFetch]);

  useEffect(() => {
    if (tab === "stats" || tab === "compos" || tab === "events") loadDetails();
    if (tab === "joueurs") loadPlayers();
  }, [tab]);

  // Refresh auto des notes en direct (toutes les 30s)
  useEffect(() => {
    if (tab !== "joueurs" || !match.is_live) return;
    const interval = setInterval(loadPlayers, 30000);
    return () => clearInterval(interval);
  }, [tab, match.is_live]);

  const teamNames = details?.stats ? Object.keys(details.stats) : [match.home, match.away];

  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* SCORE HEADER */}
      <div className="bg-surface-2 border-b border-surface-3">
        {match.is_live && (
          <div className="flex items-center justify-center gap-2 py-1.5 bg-danger/5 border-b border-danger/10">
            <Radio size={10} className="text-danger animate-pulse" />
            <span className="text-[11px] font-bold text-danger tracking-widest">EN DIRECT</span>
          </div>
        )}

        <div className="px-6 pt-5 pb-4">
          {/* Stage info */}
          <p className="text-[11px] text-zinc-600 text-center mb-4">
            {STAGE_LABEL[match.stage] || match.stage || ""}
            {match.group ? ` · ${match.group.replace("_", " ")}` : ""}
            {d && !hasScore ? ` · ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>

          {/* Teams + score */}
          <div className="flex items-center gap-4">
            {/* Home */}
            <button onClick={() => match.home_id && onTeamClick(match.home_id)} className="flex-1 flex flex-col items-center gap-2 group">
              {match.home_crest
                ? <img src={match.home_crest} alt={match.home} className="w-14 h-14 object-contain" />
                : <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center"><span className="text-sm font-bold text-zinc-400">{match.home_tla}</span></div>
              }
              <span className={`text-sm font-bold text-center leading-tight group-hover:text-brand-light transition-colors ${hasScore && !score.winner?.includes("HOME") ? "text-zinc-500" : "text-zinc-100"}`}>
                {match.home}
              </span>
            </button>

            {/* Score */}
            <div className="text-center shrink-0">
              {hasScore ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`text-5xl font-black font-mono ${score.winner === "HOME_TEAM" ? "text-zinc-100" : "text-zinc-500"}`}>{score.home}</span>
                    <span className="text-2xl text-zinc-600">–</span>
                    <span className={`text-5xl font-black font-mono ${score.winner === "AWAY_TEAM" ? "text-zinc-100" : "text-zinc-500"}`}>{score.away}</span>
                  </div>
                  {score.ht_home !== null && score.ht_home !== undefined && (
                    <p className="text-[11px] text-zinc-600 mt-1">MT {score.ht_home}–{score.ht_away}</p>
                  )}
                  <p className="text-[11px] text-zinc-600">{match.status}</p>
                </>
              ) : (
                <span className="text-3xl font-black text-zinc-700">VS</span>
              )}
            </div>

            {/* Away */}
            <button onClick={() => match.away_id && onTeamClick(match.away_id)} className="flex-1 flex flex-col items-center gap-2 group">
              {match.away_crest
                ? <img src={match.away_crest} alt={match.away} className="w-14 h-14 object-contain" />
                : <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center"><span className="text-sm font-bold text-zinc-400">{match.away_tla}</span></div>
              }
              <span className={`text-sm font-bold text-center leading-tight group-hover:text-brand-light transition-colors ${hasScore && !score.winner?.includes("AWAY") ? "text-zinc-500" : "text-zinc-100"}`}>
                {match.away}
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-surface-3">
          {[["apercu", "Aperçu"], ["stats", "Stats"], ["joueurs", "Joueurs"], ["compos", "Compos"], ["events", "Événements"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-all ${
                tab === id ? "text-brand-light border-b-2 border-brand bg-brand/5" : "text-zinc-600 hover:text-zinc-300 hover:bg-surface-3/30"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto">

        {/* ── APERÇU ── */}
        {tab === "apercu" && (
          <div className="p-5">
            {/* Score prédit — hero element */}
            {!hasScore && predictedScore && (
              <div className="bg-surface-2 border border-surface-3 rounded-2xl p-5 mb-5 text-center">
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Score prédit</p>
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="text-center">
                    {match.home_crest && <img src={match.home_crest} alt="" className="w-8 h-8 object-contain mx-auto mb-1" />}
                    <p className="text-xs text-zinc-500">{match.home_tla || match.home}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-5xl font-black font-mono text-zinc-100 tracking-tight">
                      {predictedScore.score.split("-")[0]}
                      <span className="text-zinc-600 mx-2">–</span>
                      {predictedScore.score.split("-")[1]}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">probabilité {predictedScore.prob}%</p>
                  </div>
                  <div className="text-center">
                    {match.away_crest && <img src={match.away_crest} alt="" className="w-8 h-8 object-contain mx-auto mb-1" />}
                    <p className="text-xs text-zinc-500">{match.away_tla || match.away}</p>
                  </div>
                </div>
                {/* Top 5 scores */}
                <div className="flex gap-2 justify-center mt-3">
                  {pred.top_scores.map((s, i) => (
                    <div key={i} className={`px-2.5 py-1.5 rounded-lg text-center ${i === 0 ? "bg-brand/10 border border-brand/20" : "bg-surface-3"}`}>
                      <p className={`text-sm font-bold font-mono ${i === 0 ? "text-brand-light" : "text-zinc-400"}`}>{s.score}</p>
                      <p className="text-[9px] text-zinc-600">{s.prob}%</p>
                    </div>
                  ))}
                </div>
                {/* Value bets */}
                {vbs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-surface-3">
                    {vbs.map((vb, i) => (
                      <p key={i} className="text-[11px] text-success font-semibold">
                        Value bet : {vb.type === "home" ? match.home : vb.type === "away" ? match.away : "Nul"} à {vb.odds} (+{vb.edge}% edge)
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasOdds ? (
              <>
                {/* Prob display */}
                <div className="grid grid-cols-3 mb-3 text-center">
                  {[
                    { label: "1", team: match.home_tla || match.home, prob: best.home.prob, odds: best.home.odds },
                    { label: "X", team: "Nul", prob: best.draw.prob, odds: best.draw.odds },
                    { label: "2", team: match.away_tla || match.away, prob: best.away.prob, odds: best.away.odds },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-3xl font-black text-zinc-100">{item.prob}<span className="text-base font-normal text-zinc-500">%</span></p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{item.team}</p>
                      <p className="font-mono text-sm text-brand-light font-bold mt-1">{item.odds?.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                {/* Prob bar */}
                <div className="flex h-2 rounded-full overflow-hidden mb-5">
                  <div style={{ width: `${best.home.prob}%` }} className="bg-brand" />
                  <div style={{ width: `${best.draw.prob}%` }} className="bg-zinc-600" />
                  <div style={{ width: `${best.away.prob}%` }} className="bg-danger" />
                </div>

                {/* Bookmakers table */}
                <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
                  <div className="grid grid-cols-[1fr_52px_52px_52px] text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-4 py-2 border-b border-surface-3">
                    <span>Bookmaker</span>
                    <span className="text-center">1</span>
                    <span className="text-center">X</span>
                    <span className="text-center">2</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-surface-3/40">
                    {(match.all_odds || []).map((bk, i) => (
                      <div key={i} className="grid grid-cols-[1fr_52px_52px_52px] px-4 py-2 hover:bg-surface-3/30 transition-colors">
                        <span className="text-xs text-zinc-500 truncate pr-2">{bk.bookmaker}</span>
                        {["home", "draw", "away"].map((t) => {
                          const v = bk[t];
                          const isBest = v === best[t]?.odds;
                          return <span key={t} className={`text-center font-mono text-xs ${isBest ? "text-success font-bold" : "text-zinc-400"}`}>{v?.toFixed(2) || "–"}</span>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-zinc-600 text-sm">
                {hasScore ? "Match terminé — clique sur une équipe pour voir son profil" : "Cotes non disponibles"}
              </div>
            )}
          </div>
        )}

        {/* ── STATS / COMPOS / EVENTS ── */}
        {/* ── JOUEURS ── */}
        {tab === "joueurs" && (
          <div className="p-4">
            {!canFetch && (
              <div className="text-center py-10 text-zinc-600 text-sm">Disponible pour les matchs des 48 dernières heures</div>
            )}
            {canFetch && loadingPlayers && !players && (
              <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>
            )}
            {canFetch && !loadingPlayers && !players && (
              <div className="text-center py-10">
                <p className="text-sm text-zinc-500">Notes non disponibles</p>
                <p className="text-xs text-zinc-700 mt-1">Disponible pour les matchs des 48 dernières heures</p>
              </div>
            )}
            {canFetch && players && (
              <div className="space-y-5">
                {match.is_live && (
                  <div className="flex items-center gap-2 text-[11px] text-danger">
                    <Radio size={10} className="animate-pulse" />
                    <span>Notes en direct — mise à jour toutes les 30s</span>
                  </div>
                )}
                {players.teams?.map(team => (
                  <div key={team.team}>
                    <div className="flex items-center gap-2 mb-2">
                      {team.team_logo && <img src={team.team_logo} alt="" className="w-5 h-5 object-contain" />}
                      <span className="text-xs font-bold text-zinc-300">{team.team}</span>
                    </div>
                    <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] text-[10px] font-semibold text-zinc-600 uppercase px-3 py-2 border-b border-surface-3 gap-2">
                        <span className="w-5 text-center">#</span>
                        <span>Joueur</span>
                        <span className="text-center w-10">Note</span>
                        <span className="text-center w-6">G</span>
                        <span className="text-center w-6">A</span>
                        <span className="text-center w-8">Tirs</span>
                        <span className="text-center w-10">Passes</span>
                        <span className="text-center w-6">Min</span>
                      </div>
                      {team.players.map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => p.id && onPlayerClick?.(p.id, p.name)}
                          className={`w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] items-center px-3 py-2 border-b border-surface-3/30 gap-2 text-left hover:bg-surface-3/30 transition-colors ${
                            p.substitute ? "opacity-60" : ""
                          } ${i === team.players.filter(x => !x.substitute).length ? "border-t-2 border-surface-3 mt-1" : ""}`}
                        >
                          <span className="w-5 text-center text-[11px] font-mono text-zinc-600">{p.number}</span>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${p.captain ? "text-zinc-100" : "text-zinc-300"}`}>
                              {p.name.split(" ").slice(-1)[0]}{p.captain ? " (C)" : ""}
                            </p>
                            {p.substitute && <p className="text-[9px] text-zinc-600">Remplaçant</p>}
                          </div>
                          <div className="w-10 flex justify-center">
                            <RatingBadge rating={p.rating} />
                          </div>
                          <span className="w-6 text-center text-xs font-mono text-zinc-300">{p.goals || "–"}</span>
                          <span className="w-6 text-center text-xs font-mono text-zinc-400">{p.assists || "–"}</span>
                          <span className="w-8 text-center text-xs font-mono text-zinc-500">
                            {p.shots_on !== null && p.shots_on !== undefined ? `${p.shots_on}/${p.shots_total || 0}` : "–"}
                          </span>
                          <span className="w-10 text-center text-xs font-mono text-zinc-500">{p.passes_total ?? "–"}</span>
                          <span className="w-6 text-center text-xs font-mono text-zinc-600">{p.minutes ?? "–"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(tab === "stats" || tab === "compos" || tab === "events") && (
          <div className="p-5">
            {!canFetch && (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
                  <Radio size={20} className="text-zinc-600" />
                </div>
                <p className="text-sm font-semibold text-zinc-400">Données en direct uniquement</p>
                <p className="text-xs text-zinc-600 mt-1">Disponible pour les matchs des 48 dernières heures</p>
              </div>
            )}

            {canFetch && loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={20} className="animate-spin text-zinc-600" />
                <p className="text-xs text-zinc-600">Chargement...</p>
              </div>
            )}

            {canFetch && !loading && !details && (
              <div className="text-center py-10">
                <p className="text-sm text-zinc-500">Données non disponibles</p>
                <p className="text-xs text-zinc-700 mt-1 max-w-xs mx-auto">Stats/compos disponibles pour les matchs des 48 dernières heures (limite API-Football gratuit)</p>
              </div>
            )}

            {canFetch && !loading && details && tab === "stats" && (
              <div>
                <div className="grid grid-cols-[1fr_auto_1fr] text-xs font-bold mb-3">
                  <span className="text-brand-light">{teamNames[0]}</span>
                  <span className="text-zinc-600 px-4">Stat</span>
                  <span className="text-danger text-right">{teamNames[1]}</span>
                </div>
                <div className="bg-surface-2 rounded-xl border border-surface-3 px-4 py-2 divide-y divide-surface-3/40">
                  {STAT_ROWS.map(([label, key]) => {
                    const hv = details.stats[teamNames[0]]?.[key];
                    const av = details.stats[teamNames[1]]?.[key];
                    if (!hv && !av) return null;
                    return (
                      <div key={key}>
                        <p className="text-[10px] text-zinc-600 text-center pt-2">{label}</p>
                        <StatRow h={hv} a={av} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {canFetch && !loading && details && tab === "compos" && (
              <div className="space-y-4">
                {details.lineups?.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Compositions non disponibles</p>}
                {details.lineups?.map(l => <PitchLineup key={l.team} lineup={l} onPlayerClick={onPlayerClick} />)}
                {details.lineups?.map(l => l.substitutes?.length > 0 && (
                  <div key={`sub-${l.team}`} className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
                    <p className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-surface-3">{l.team} — Remplaçants</p>
                    <div className="p-3 grid grid-cols-2 gap-1">
                      {l.substitutes.map(p => (
                        <div key={p.name} className="flex items-center gap-2 px-2 py-1">
                          <span className="text-[10px] font-mono text-zinc-600 w-5 text-right">{p.number}</span>
                          <span className="text-xs text-zinc-400 truncate">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canFetch && !loading && details && tab === "events" && (
              <div className="space-y-1">
                {details.events?.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Aucun événement</p>}
                {details.events?.map((e, i) => {
                  const isHome = details.lineups?.[0]?.team === e.team;
                  const isYellow = e.detail?.includes("Yellow");
                  const isRed = e.detail?.includes("Red");
                  const EventIcon = e.type === "Goal" ? Goal : (isYellow || isRed) ? RectangleVertical : e.type === "subst" ? ArrowLeftRight : MonitorPlay;
                  const iconColor = e.type === "Goal" ? "text-success" : isYellow ? "text-warning" : isRed ? "text-danger" : "text-zinc-500";
                  return (
                    <div key={i} className={`flex items-start gap-3 py-2 px-3 rounded-lg ${i % 2 === 0 ? "bg-surface-2/40" : ""}`}>
                      <span className="text-[11px] font-mono text-zinc-600 w-8 shrink-0 text-right pt-0.5">{e.minute}'</span>
                      {isHome ? (
                        <>
                          <EventIcon size={14} className={`shrink-0 mt-0.5 ${iconColor}`} />
                          <div>
                            <p className="text-xs font-semibold text-zinc-200">{e.player}</p>
                            {e.assist && <p className="text-[10px] text-zinc-600">Passe : {e.assist}</p>}
                            {e.detail && e.type !== "Goal" && <p className="text-[10px] text-zinc-600">{e.detail}</p>}
                          </div>
                          <span className="ml-auto text-[10px] text-zinc-700 shrink-0">{match.home_tla}</span>
                        </>
                      ) : (
                        <>
                          <span className="ml-auto" />
                          <span className="text-[10px] text-zinc-700 shrink-0">{match.away_tla}</span>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-zinc-200">{e.player}</p>
                            {e.assist && <p className="text-[10px] text-zinc-600">Passe : {e.assist}</p>}
                          </div>
                          <EventIcon size={14} className={`shrink-0 mt-0.5 ${iconColor}`} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────

export default function WorldCupSection() {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [player, setPlayer] = useState(null); // { id, name }
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/worldcup/matches")
      .then(d => {
        const all = d.matches || [];
        setMatches(all);
        // Auto-sélectionne le premier match live, ou le premier à venir
        const autoSelect = all.find(m => m.is_live) || all.find(m => !m.is_finished);
        if (autoSelect) setSelected(autoSelect);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = matches.filter(m => {
    if (filter === "live") return m.is_live;
    if (filter === "upcoming") return !m.is_finished && !m.is_live;
    if (filter === "finished") return m.is_finished;
    return true;
  }).filter(m =>
    !search || m.home.toLowerCase().includes(search.toLowerCase()) || m.away.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    // Live toujours en premier
    if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
    // Matchs terminés : plus récent en premier
    // Matchs à venir : plus proche en premier
    const da = new Date(a.commence || 0);
    const db = new Date(b.commence || 0);
    return a.is_finished ? db - da : da - db;
  });

  const liveCount = matches.filter(m => m.is_live).length;
  const finishedCount = matches.filter(m => m.is_finished).length;

  return (
    <div className="flex h-[calc(100vh-96px)]">
      {/* ── LEFT LIST ── */}
      <div className="w-[320px] border-r border-surface-3 flex flex-col bg-surface-1">
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-surface-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold text-zinc-100">FIFA World Cup 2026</p>
              <p className="text-[11px] text-zinc-600">{finishedCount} joués · {matches.length - finishedCount} à venir{liveCount > 0 ? ` · ` : ""}{liveCount > 0 && <span className="text-danger">{liveCount} live</span>}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une équipe..."
              className="w-full bg-surface-3 border border-surface-4 rounded-lg pl-7 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"><X size={12} /></button>}
          </div>

          {/* Filters */}
          <div className="flex gap-1">
            {[["all", "Tous", matches.length], ["upcoming", "À venir", matches.filter(m => !m.is_finished && !m.is_live).length], ["finished", "Résultats", finishedCount], ["live", "Live", liveCount]].map(([val, label, count]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`flex-1 text-[10px] py-1 rounded-md font-semibold transition-all ${filter === val ? "bg-brand/10 text-brand-light" : "text-zinc-600 hover:text-zinc-400"}`}>
                {label}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Match list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-16"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>}
          {!loading && filtered.length === 0 && <p className="text-center text-xs text-zinc-600 py-10">Aucun match</p>}
          {!loading && (() => {
            // Grouper par date (YYYY-MM-DD) pour les séparateurs
            const byDate = {};
            for (const m of filtered) {
              const key = m.commence ? new Date(m.commence).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "Date inconnue";
              if (!byDate[key]) byDate[key] = [];
              byDate[key].push(m);
            }
            return Object.entries(byDate).map(([date, dayMatches]) => (
              <div key={date}>
                <div className="px-4 py-1.5 bg-surface-0/60 sticky top-0 z-10 border-b border-surface-3/30">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{date}</span>
                </div>
                {dayMatches.map(m => (
                  <MatchRow key={m.id} match={m}
                    isSelected={selected?.id === m.id && !teamId}
                    onClick={() => { setSelected(m); setTeamId(null); }} />
                ))}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 overflow-hidden">
        {player ? (
          <PlayerPanel playerId={player.id} playerName={player.name} onBack={() => setPlayer(null)} />
        ) : teamId ? (
          <TeamPanel teamId={teamId} onBack={() => setTeamId(null)} />
        ) : selected ? (
          <DetailPanel
            match={selected}
            onTeamClick={(id) => { setTeamId(id); setPlayer(null); }}
            onPlayerClick={(id, name) => { setPlayer({ id, name }); setTeamId(null); }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 flex items-center justify-center">
              <Radio size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-semibold text-zinc-500">Sélectionne un match</p>
            <p className="text-xs text-zinc-700">score · stats · compositions · événements</p>
          </div>
        )}
      </div>
    </div>
  );
}
