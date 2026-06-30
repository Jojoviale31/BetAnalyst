"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Radio,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  Goal,
  Square,
  ArrowLeftRight,
  MonitorPlay,
  Circle,
  Search,
} from "lucide-react";
import { fetchFixtureDetails } from "@/lib/api";

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const STAGE_LABEL = {
  GROUP_STAGE: "Phase de groupes",
  ROUND_OF_32: "16es",
  ROUND_OF_16: "8es",
  QUARTER_FINALS: "Quarts",
  SEMI_FINALS: "Demis",
  THIRD_PLACE: "3e place",
  FINAL: "Finale",
};

const POS_LABEL = { Goalkeeper: "Gardiens", Defence: "Défenseurs", Midfield: "Milieux", Offence: "Attaquants" };

// ─── EVENT ICON (no emojis) ───────────────────────────────

function EventIcon({ type, detail, size = 13 }) {
  if (type === "Goal" || type === "Own Goal") return <Goal size={size} className="text-success" />;
  if (type === "Card") {
    const isRed = detail?.toLowerCase().includes("red");
    return <Square size={size - 2} className={isRed ? "text-danger fill-danger" : "text-warning fill-warning"} />;
  }
  if (type === "subst") return <ArrowLeftRight size={size} className="text-brand-light" />;
  if (type === "Var") return <MonitorPlay size={size} className="text-zinc-400" />;
  return <Circle size={6} className="text-zinc-600 fill-zinc-600" />;
}

// ─── PRIMITIVES ───────────────────────────────────────────

function ProbBar({ home, draw, away }) {
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-surface-3">
      <div style={{ width: `${home}%` }} className="bg-brand transition-all" />
      <div style={{ width: `${draw}%` }} className="bg-zinc-600 transition-all" />
      <div style={{ width: `${away}%` }} className="bg-danger transition-all" />
    </div>
  );
}

function StatBar({ label, homeVal, awayVal }) {
  const parseNum = (v) => {
    if (v === null || v === undefined) return 0;
    return parseInt(String(v).replace("%", "")) || 0;
  };
  const h = parseNum(homeVal);
  const a = parseNum(awayVal);
  const total = h + a || 1;
  const hPct = Math.round((h / total) * 100);
  const aPct = 100 - hPct;
  const homeLead = h > a;
  const awayLead = a > h;

  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className={`font-mono font-bold tabular-nums ${homeLead ? "text-brand-light" : "text-zinc-300"}`}>{homeVal ?? "-"}</span>
        <span className="text-zinc-600 uppercase tracking-wide text-[10px]">{label}</span>
        <span className={`font-mono font-bold tabular-nums ${awayLead ? "text-danger" : "text-zinc-300"}`}>{awayVal ?? "-"}</span>
      </div>
      <div className="flex h-1 rounded-full overflow-hidden bg-surface-2">
        <div className="flex-1 flex justify-end">
          <div style={{ width: `${hPct}%` }} className="bg-brand/80 rounded-l-full transition-all" />
        </div>
        <div className="w-px bg-surface-0" />
        <div className="flex-1">
          <div style={{ width: `${aPct}%` }} className="bg-danger/80 rounded-r-full transition-all" />
        </div>
      </div>
    </div>
  );
}

// ─── LINEUP FORMATION GRID ────────────────────────────────

function FormationGrid({ lineup }) {
  if (!lineup?.startXI?.length) return null;

  const rows = {};
  for (const p of lineup.startXI) {
    const row = p.grid ? p.grid.split(":")[0] : "0";
    if (!rows[row]) rows[row] = [];
    rows[row].push(p);
  }
  const rowKeys = Object.keys(rows).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="rounded-md overflow-hidden border border-[#1f4d24]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#143018] border-b border-[#1f4d24]">
        <div className="flex items-center gap-1.5">
          {lineup.team_logo && <img src={lineup.team_logo || "/placeholder.svg"} alt="" className="w-4 h-4 object-contain" />}
          <span className="text-[11px] font-bold text-zinc-100">{lineup.team}</span>
        </div>
        <span className="text-[11px] text-emerald-300/70 font-mono font-bold">{lineup.formation}</span>
      </div>
      <div
        className="px-2 py-3 space-y-3"
        style={{ background: "repeating-linear-gradient(0deg,#11280f 0px,#11280f 28px,#0f2410 28px,#0f2410 56px)" }}
      >
        {rowKeys.map((row) => (
          <div key={row} className="flex justify-around items-start">
            {rows[row].map((p) => (
              <div key={p.name} className="text-center w-14">
                <div className="w-7 h-7 rounded-full bg-[#1f4d24] border border-emerald-400/40 flex items-center justify-center mx-auto mb-0.5 shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-50 font-mono">{p.number}</span>
                </div>
                <p className="text-[9px] text-emerald-100/80 leading-tight truncate">{p.name.split(" ").pop()}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      {lineup.coach && <p className="text-[10px] text-zinc-600 px-3 py-1.5 bg-surface-1">Coach · {lineup.coach}</p>}
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
      className={`w-full text-left px-3 py-2.5 border-b border-surface-2 transition-colors ${
        isSelected ? "bg-brand/[0.07] border-l-2 border-l-brand" : "hover:bg-surface-2/60 border-l-2 border-l-transparent"
      }`}
    >
      {/* Status line */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {match.is_live ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-danger">
              <Radio size={9} className="animate-pulse" /> LIVE {match.status_short || ""}
            </span>
          ) : match.is_finished ? (
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wide">Terminé</span>
          ) : d ? (
            <span className="text-[10px] text-zinc-500 font-mono">
              {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
          {match.group && <span className="text-[10px] text-zinc-700">{match.group.replace("_", " ")}</span>}
        </div>
        <ChevronRight size={12} className={`shrink-0 ${isSelected ? "text-brand" : "text-zinc-700"}`} />
      </div>

      {hasScore ? (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[13px] truncate flex-1 ${homeWon ? "text-zinc-100 font-semibold" : "text-zinc-500"}`}>{match.home}</span>
            <span className={`font-mono text-base font-bold tabular-nums shrink-0 ${homeWon ? "text-zinc-100" : "text-zinc-400"}`}>{score.home}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[13px] truncate flex-1 ${awayWon ? "text-zinc-100 font-semibold" : "text-zinc-500"}`}>{match.away}</span>
            <span className={`font-mono text-base font-bold tabular-nums shrink-0 ${awayWon ? "text-zinc-100" : "text-zinc-400"}`}>{score.away}</span>
          </div>
          {score.ht_home !== null && score.ht_home !== undefined && (
            <p className="text-[10px] text-zinc-700 font-mono pt-0.5">MT {score.ht_home}-{score.ht_away}</p>
          )}
        </div>
      ) : (
        <div>
          <div className="space-y-0.5 mb-2">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[13px] font-medium text-zinc-200 truncate flex-1">{match.home}</span>
              {best?.home && <span className="font-mono text-[11px] text-zinc-500 tabular-nums shrink-0">{best.home.odds?.toFixed(2)}</span>}
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-[13px] font-medium text-zinc-200 truncate flex-1">{match.away}</span>
              {best?.away && <span className="font-mono text-[11px] text-zinc-500 tabular-nums shrink-0">{best.away.odds?.toFixed(2)}</span>}
            </div>
          </div>
          {best?.home && (
            <>
              <ProbBar home={best.home.prob} draw={best.draw.prob} away={best.away.prob} />
              <div className="flex justify-between mt-1 text-[10px] font-mono text-zinc-600 tabular-nums">
                <span className="text-brand-light/70">{best.home.prob}%</span>
                <span>N {best.draw.prob}%</span>
                <span className="text-danger/70">{best.away.prob}%</span>
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

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={18} className="text-zinc-600 animate-spin" /></div>;
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
      <div className="px-5 py-4 border-b border-surface-3 sticky top-0 bg-surface-1/90 backdrop-blur-sm z-10">
        <button onClick={onBack} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 mb-3 transition-colors">
          <ChevronLeft size={13} /> Retour au match
        </button>
        <div className="flex items-center gap-3">
          {data.crest && <img src={data.crest || "/placeholder.svg"} alt={data.name} className="w-12 h-12 object-contain" />}
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-100 truncate">{data.name}</h2>
            <p className="text-xs text-zinc-500">
              {data.area}
              {data.coach?.name && <span className="text-zinc-600"> · {data.coach.name}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {data.matches?.filter((m) => m.score).length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2">Résultats World Cup</p>
            <div className="rounded-md border border-surface-3 overflow-hidden divide-y divide-surface-2">
              {data.matches.map((m, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-surface-1 hover:bg-surface-2 transition-colors">
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-600">{m.stage ? STAGE_LABEL[m.stage] || m.stage : ""}</p>
                    <p className="text-[13px] text-zinc-300 truncate">
                      <span className="text-zinc-600 text-[10px] font-mono mr-1.5">{m.venue}</span>
                      {m.opponent}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {m.score ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-mono font-bold text-zinc-100 tabular-nums">{m.score}</span>
                        <span
                          className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                            m.result === "W" ? "bg-success/15 text-success" : m.result === "D" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"
                          }`}
                        >
                          {m.result}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-600">{m.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users size={12} /> Effectif · {data.squad?.length}
          </p>
          {["Goalkeeper", "Defence", "Midfield", "Offence"].filter((pos) => byPos[pos]?.length).map((pos) => (
            <div key={pos} className="mb-3">
              <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">{POS_LABEL[pos]}</p>
              <div className="grid grid-cols-3 gap-1">
                {byPos[pos].map((p) => (
                  <div key={p.id} className="bg-surface-2 rounded px-2.5 py-1.5 border border-surface-3">
                    <p className="text-[12px] font-medium text-zinc-200 truncate">{p.name}</p>
                    {p.dob && <p className="text-[10px] text-zinc-600 font-mono">{new Date().getFullYear() - new Date(p.dob).getFullYear()} ans</p>}
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
    if (tab === "stats" || tab === "lineups" || tab === "events") loadDetails();
  }, [tab, loadDetails]);

  const homeStats = details?.stats ? Object.values(details.stats)[0] : null;
  const awayStats = details?.stats ? Object.values(details.stats)[1] : null;
  const homeTeamName = details?.stats ? Object.keys(details.stats)[0] : match.home;
  const awayTeamName = details?.stats ? Object.keys(details.stats)[1] : match.away;

  return (
    <div className="flex flex-col h-full">
      {/* Score header */}
      <div className="px-6 py-5 border-b border-surface-3 bg-surface-1">
        <div className="flex items-center justify-center gap-2 mb-3">
          {match.is_live && (
            <span className="flex items-center gap-1 text-danger text-[10px] font-bold uppercase tracking-wide">
              <Radio size={10} className="animate-pulse" /> En direct
            </span>
          )}
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider text-center">
            {match.stage ? STAGE_LABEL[match.stage] || match.stage : "World Cup 2026"}
            {match.group ? ` · ${match.group.replace("_", " ")}` : ""}
          </p>
        </div>

        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 flex flex-col items-end text-right">
            {match.home_crest && <img src={match.home_crest || "/placeholder.svg"} alt={match.home} className="w-12 h-12 object-contain mb-1.5" />}
            <button
              onClick={() => match.home_id && onTeamClick(match.home_id)}
              className={`text-sm font-bold hover:text-brand-light transition-colors ${hasScore && score.winner === "HOME_TEAM" ? "text-zinc-100" : hasScore ? "text-zinc-500" : "text-zinc-200"}`}
            >
              {match.home}
            </button>
          </div>

          <div className="text-center shrink-0 px-2">
            {hasScore ? (
              <>
                <p className="text-4xl font-bold font-mono text-zinc-100 leading-none tabular-nums">
                  {score.home}<span className="text-zinc-700 mx-1.5">:</span>{score.away}
                </p>
                {score.ht_home !== null && score.ht_home !== undefined && (
                  <p className="text-[11px] text-zinc-600 font-mono mt-1.5">MT {score.ht_home}-{score.ht_away}</p>
                )}
                {match.status && <p className="text-[10px] text-zinc-500 mt-0.5">{match.status}</p>}
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-zinc-700 font-mono">VS</p>
                {d && (
                  <p className="text-[11px] text-zinc-500 font-mono mt-1">
                    {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex-1 flex flex-col items-start text-left">
            {match.away_crest && <img src={match.away_crest || "/placeholder.svg"} alt={match.away} className="w-12 h-12 object-contain mb-1.5" />}
            <button
              onClick={() => match.away_id && onTeamClick(match.away_id)}
              className={`text-sm font-bold hover:text-brand-light transition-colors ${hasScore && score.winner === "AWAY_TEAM" ? "text-zinc-100" : hasScore ? "text-zinc-500" : "text-zinc-200"}`}
            >
              {match.away}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 bg-surface-1 px-2">
        {[
          ["overview", "Aperçu"],
          ["stats", "Statistiques"],
          ["lineups", "Compositions"],
          ["events", "Événements"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors relative ${
              tab === id ? "text-brand-light" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {label}
            {tab === id && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />}
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
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2.5">Probabilités implicites</p>
                  <ProbBar home={best.home.prob} draw={best.draw.prob} away={best.away.prob} />
                  <div className="grid grid-cols-3 mt-3 gap-2">
                    {[
                      { label: match.home_tla || match.home, prob: best.home.prob, odds: best.home.odds, bk: best.home.bookmaker, accent: "text-brand-light" },
                      { label: "Nul", prob: best.draw.prob, odds: best.draw.odds, bk: best.draw.bookmaker, accent: "text-zinc-300" },
                      { label: match.away_tla || match.away, prob: best.away.prob, odds: best.away.odds, bk: best.away.bookmaker, accent: "text-danger" },
                    ].map((item) => (
                      <div key={item.label} className="bg-surface-2 rounded-md border border-surface-3 px-2 py-3 text-center">
                        <div className="text-2xl font-bold text-zinc-100 font-mono tabular-nums leading-none">{item.prob}%</div>
                        <div className="text-[11px] text-zinc-500 mt-1 truncate">{item.label}</div>
                        <div className={`font-mono text-sm font-semibold mt-1.5 tabular-nums ${item.accent}`}>{item.odds?.toFixed(2)}</div>
                        <div className="text-[9px] text-zinc-700 truncate mt-0.5">{item.bk}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-surface-3 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-surface-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Comparateur cotes</p>
                    <span className="text-[10px] text-zinc-600">{match.bookmakers_count} books</span>
                  </div>
                  <div className="grid grid-cols-4 text-[9px] text-zinc-600 uppercase font-bold px-3 py-1.5 bg-surface-1 border-b border-surface-3">
                    <span>Bookmaker</span>
                    <span className="text-right">1</span>
                    <span className="text-right">X</span>
                    <span className="text-right">2</span>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto divide-y divide-surface-2">
                    {(match.all_odds || []).map((bk, i) => (
                      <div key={i} className="grid grid-cols-4 px-3 py-1.5 hover:bg-surface-2/50">
                        <span className="text-[11px] text-zinc-500 truncate pr-1">{bk.bookmaker}</span>
                        {["home", "draw", "away"].map((type) => {
                          const val = bk[type];
                          const isBest = val === best[type]?.odds;
                          return (
                            <span key={type} className={`text-right font-mono text-[11px] tabular-nums ${isBest ? "text-success font-bold" : "text-zinc-400"}`}>
                              {val?.toFixed(2) || "-"}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {!hasOdds && hasScore && (
              <div className="text-center text-xs text-zinc-600 py-8">Match terminé · clique sur une équipe pour voir son profil</div>
            )}
            {!hasOdds && !hasScore && <div className="text-center text-xs text-zinc-600 py-8">Cotes non disponibles pour ce match</div>}
          </div>
        )}

        {(tab === "stats" || tab === "lineups" || tab === "events") && (
          <div>
            {!canFetchLiveData && (
              <div className="text-center py-12">
                <p className="text-sm text-zinc-500">Données en direct uniquement</p>
                <p className="text-xs text-zinc-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Stats, compositions et événements sont disponibles pour les matchs{" "}
                  <span className="text-brand-light">en cours ou programmés aujourd&apos;hui</span>
                </p>
              </div>
            )}

            {canFetchLiveData && loadingDetails && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={18} className="text-zinc-600 animate-spin" />
                <p className="text-xs text-zinc-600">Chargement depuis API-Football...</p>
              </div>
            )}

            {canFetchLiveData && !loadingDetails && !details && (
              <div className="text-center py-12">
                <p className="text-sm text-zinc-500">Données non disponibles</p>
                <p className="text-xs text-zinc-700 mt-1">Match introuvable dans API-Football</p>
              </div>
            )}

            {!loadingDetails && details && tab === "stats" && (
              <div>
                <div className="flex justify-between items-center text-[11px] font-bold mb-4">
                  <span className="text-brand-light truncate">{homeTeamName}</span>
                  <span className="text-zinc-700 uppercase tracking-wide text-[10px]">Match</span>
                  <span className="text-danger truncate text-right">{awayTeamName}</span>
                </div>
                {STAT_ROWS.map(({ label, key }) => {
                  if (!homeStats?.[key] && !awayStats?.[key]) return null;
                  return <StatBar key={key} label={label} homeVal={homeStats?.[key]} awayVal={awayStats?.[key]} />;
                })}
              </div>
            )}

            {!loadingDetails && details && tab === "lineups" && (
              <div className="space-y-3">
                {details.lineups?.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Compositions non encore disponibles</p>}
                {details.lineups?.map((lineup) => (
                  <FormationGrid key={lineup.team} lineup={lineup} />
                ))}
                {details.lineups?.map(
                  (lineup) =>
                    lineup.substitutes?.length > 0 && (
                      <div key={`subs-${lineup.team}`} className="rounded-md border border-surface-3 overflow-hidden">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-3 py-1.5 bg-surface-2 border-b border-surface-3">
                          {lineup.team} · Remplaçants
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 bg-surface-1">
                          {lineup.substitutes.map((p) => (
                            <div key={p.name} className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-600 font-mono w-5 text-right tabular-nums">{p.number}</span>
                              <span className="text-[12px] text-zinc-400 truncate">{p.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}

            {!loadingDetails && details && tab === "events" && (
              <div>
                {details.events?.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Aucun événement</p>}
                <div className="relative">
                  {details.events?.length > 0 && <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-3 -translate-x-1/2" />}
                  <div className="space-y-2">
                    {details.events?.map((e, i) => {
                      const isHome = e.team === match.home || details.lineups?.[0]?.team === e.team;
                      return (
                        <div key={i} className="relative flex items-center gap-3">
                          {isHome ? (
                            <>
                              <div className="flex-1 flex items-center justify-end gap-2 text-right">
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold text-zinc-200 truncate">{e.player}</p>
                                  {e.assist && <p className="text-[10px] text-zinc-600 truncate">Passe · {e.assist}</p>}
                                  {e.detail && e.type !== "Goal" && <p className="text-[10px] text-zinc-600 truncate">{e.detail}</p>}
                                </div>
                                <EventIcon type={e.type} detail={e.detail} />
                              </div>
                              <span className="w-9 shrink-0 text-center text-[10px] font-mono font-bold text-zinc-400 bg-surface-2 rounded py-0.5 z-10 tabular-nums">
                                {e.minute}&apos;
                              </span>
                              <div className="flex-1" />
                            </>
                          ) : (
                            <>
                              <div className="flex-1" />
                              <span className="w-9 shrink-0 text-center text-[10px] font-mono font-bold text-zinc-400 bg-surface-2 rounded py-0.5 z-10 tabular-nums">
                                {e.minute}&apos;
                              </span>
                              <div className="flex-1 flex items-center gap-2">
                                <EventIcon type={e.type} detail={e.detail} />
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold text-zinc-200 truncate">{e.player}</p>
                                  {e.assist && <p className="text-[10px] text-zinc-600 truncate">Passe · {e.assist}</p>}
                                  {e.detail && e.type !== "Goal" && <p className="text-[10px] text-zinc-600 truncate">{e.detail}</p>}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiFetch("/api/worldcup/matches")
      .then((data) => {
        setMatches(data.matches || []);
        setReqRemaining(data.api_requests_remaining);
        setLoading(false);
      })
      .catch(() => {
        setError("Backend non disponible");
        setLoading(false);
      });
  }, []);

  const filtered = matches.filter((m) => {
    if (filter === "live" && !m.is_live) return false;
    if (filter === "upcoming" && (m.is_finished || m.is_live)) return false;
    if (filter === "finished" && !m.is_finished) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!`${m.home} ${m.away}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const liveCount = matches.filter((m) => m.is_live).length;
  const finishedCount = matches.filter((m) => m.is_finished).length;

  const FILTERS = [
    ["all", "Tous", matches.length],
    ["upcoming", "À venir", matches.length - finishedCount - liveCount],
    ["finished", "Résultats", finishedCount],
    ["live", "Live", liveCount],
  ];

  return (
    <div className="flex h-[calc(100vh-84px)]">
      {/* Liste matchs */}
      <div className="w-[320px] border-r border-surface-3 flex flex-col bg-surface-1">
        <div className="px-3 pt-3 pb-2 border-b border-surface-3">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-[13px] font-bold text-zinc-200">FIFA World Cup 2026</h2>
              <p className="text-[10px] text-zinc-600 font-mono">
                {matches.length} matchs · {finishedCount} joués
                {liveCount > 0 && <span className="text-danger"> · {liveCount} live</span>}
              </p>
            </div>
            {reqRemaining && <span className="text-[9px] text-zinc-700 font-mono">{reqRemaining} req</span>}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une équipe"
              className="w-full bg-surface-2 border border-surface-3 rounded-md pl-8 pr-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand/50"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-1">
            {FILTERS.map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded font-medium transition-colors ${
                  filter === val ? "bg-brand/15 text-brand-light" : "text-zinc-600 hover:text-zinc-300 hover:bg-surface-2"
                }`}
              >
                {label}
                <span className={`font-mono text-[9px] tabular-nums ${filter === val ? "text-brand-light/70" : "text-zinc-700"}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 size={18} className="text-zinc-600 animate-spin" />
            </div>
          )}
          {error && <p className="text-center text-sm text-danger py-8">{error}</p>}
          {!loading && !error && filtered.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              isSelected={selected?.id === m.id && !selectedTeamId}
              onClick={() => {
                setSelected(m);
                setSelectedTeamId(null);
              }}
            />
          ))}
          {!loading && !error && filtered.length === 0 && <p className="text-center text-xs text-zinc-600 py-12">Aucun match</p>}
        </div>
      </div>

      {/* Panneau droit */}
      <div className="flex-1 overflow-hidden bg-surface-0">
        {selectedTeamId ? (
          <TeamPanel teamId={selectedTeamId} onBack={() => setSelectedTeamId(null)} />
        ) : selected ? (
          <MatchDetailPanel match={selected} onTeamClick={setSelectedTeamId} />
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-sm text-zinc-500">Sélectionne un match</p>
              <p className="text-xs text-zinc-700 mt-1 font-mono">score · stats · compositions · événements</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
