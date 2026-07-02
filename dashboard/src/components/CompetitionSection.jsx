"use client";

import { useState, useEffect } from "react";
import { Loader2, Trophy, Target, Footprints, Star } from "lucide-react";

async function apiFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.json();
}

// ─── STANDINGS ────────────────────────────────────────────

function GroupTable({ group }) {
  return (
    <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
      <div className="px-4 py-2 border-b border-surface-3 bg-surface-3/30">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{group.group}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-zinc-600 uppercase">
            <th className="text-left px-3 py-1.5 font-semibold w-6">#</th>
            <th className="text-left px-2 py-1.5 font-semibold">Équipe</th>
            <th className="text-center px-2 py-1.5 font-semibold w-6">J</th>
            <th className="text-center px-2 py-1.5 font-semibold w-6">V</th>
            <th className="text-center px-2 py-1.5 font-semibold w-6">N</th>
            <th className="text-center px-2 py-1.5 font-semibold w-6">D</th>
            <th className="text-center px-2 py-1.5 font-semibold w-10">BM</th>
            <th className="text-center px-2 py-1.5 font-semibold w-10">BE</th>
            <th className="text-center px-2 py-1.5 font-semibold w-8">+/-</th>
            <th className="text-center px-3 py-1.5 font-semibold w-8">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.table.map((t, i) => (
            <tr key={t.team} className={`border-t border-surface-3/40 ${t.qualified ? "bg-success/5" : ""} ${i === 1 ? "border-b-2 border-surface-3" : ""}`}>
              <td className="px-2 py-2 w-6">
                <span className={`text-xs font-bold ${t.qualified ? "text-success" : "text-zinc-600"}`}>{t.position}</span>
              </td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  {t.team_crest && <img src={t.team_crest} alt="" className="w-4 h-4 object-contain shrink-0" />}
                  <span className={`text-xs font-semibold truncate max-w-[90px] ${t.qualified ? "text-zinc-100" : "text-zinc-400"}`} title={t.team}>
                    {t.team_tla || t.team}
                  </span>
                </div>
              </td>
              <td className="text-center px-1 py-1.5 text-xs text-zinc-500 font-mono">{t.played}</td>
              <td className="text-center px-1 py-1.5 text-xs text-success font-mono">{t.won}</td>
              <td className="text-center px-1 py-1.5 text-xs text-zinc-500 font-mono">{t.draw}</td>
              <td className="text-center px-1 py-1.5 text-xs text-danger font-mono">{t.lost}</td>
              <td className="text-center px-1 py-1.5 text-xs text-zinc-400 font-mono">{t.gf}</td>
              <td className="text-center px-1 py-1.5 text-xs text-zinc-400 font-mono">{t.ga}</td>
              <td className="text-center px-1 py-1.5 text-xs font-mono">
                <span className={t.gd > 0 ? "text-success" : t.gd < 0 ? "text-danger" : "text-zinc-500"}>
                  {t.gd > 0 ? "+" : ""}{t.gd}
                </span>
              </td>
              <td className="text-center px-2 py-1.5 w-8">
                <span className={`text-sm font-black font-mono ${t.qualified ? "text-zinc-100" : "text-zinc-400"}`}>{t.points}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/worldcup/standings")
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>;
  if (!data?.groups?.length) return <p className="text-center text-zinc-600 py-10">Données non disponibles</p>;

  return (
    <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
      {data.groups.map(g => (
        <div key={g.group} className="break-inside-avoid mb-4">
          <GroupTable group={g} />
        </div>
      ))}
    </div>
  );
}

// ─── BRACKET ──────────────────────────────────────────────

function BracketMatch({ match, isLive }) {
  const homeWon = match.winner === "HOME_TEAM";
  const awayWon = match.winner === "AWAY_TEAM";
  const hasScore = match.home_score !== null && match.home_score !== undefined;
  const isTBD = match.home === "TBD" || match.away === "TBD";

  return (
    <div className={`bg-surface-2 rounded-xl border overflow-hidden min-w-[200px] ${
      isLive ? "border-danger/30" : "border-surface-3"
    }`}>
      {isLive && (
        <div className="text-[9px] font-bold text-danger text-center py-0.5 bg-danger/10">LIVE</div>
      )}
      {[
        { name: match.home, crest: match.home_crest, score: match.home_score, won: homeWon },
        { name: match.away, crest: match.away_crest, score: match.away_score, won: awayWon },
      ].map((team, i) => (
        <div key={i} className={`flex items-center justify-between px-3 py-2 ${
          i === 0 ? "border-b border-surface-3/50" : ""
        } ${team.won ? "bg-success/5" : ""}`}>
          <div className="flex items-center gap-2 min-w-0">
            {team.crest && !isTBD && <img src={team.crest} alt="" className="w-5 h-5 object-contain shrink-0" />}
            <span className={`text-sm truncate ${
              isTBD ? "text-zinc-700 italic" :
              team.won ? "font-bold text-zinc-100" : "text-zinc-400"
            }`}>{team.name}</span>
          </div>
          {hasScore && (
            <span className={`font-mono text-sm font-bold ml-2 shrink-0 ${team.won ? "text-zinc-100" : "text-zinc-500"}`}>
              {team.score}
            </span>
          )}
        </div>
      ))}
      {match.date && !hasScore && !isTBD && (
        <div className="text-center text-[10px] text-zinc-600 pb-1.5 font-mono">
          {new Date(match.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          {" · "}
          {new Date(match.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

function BracketView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/worldcup/bracket")
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>;
  if (!data?.rounds?.length) return <p className="text-center text-zinc-600 py-10">Données non disponibles</p>;

  return (
    <div className="space-y-8">
      {data.rounds.map(round => (
        <div key={round.label}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{round.label}</h3>
            <div className="flex-1 h-px bg-surface-3" />
            <span className="text-[10px] text-zinc-600">{round.matches.length} matchs</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {round.matches.map(m => (
              <BracketMatch key={m.id || `${m.home}-${m.away}`} match={m} isLive={m.status === "IN_PLAY"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── STATS VIEW ───────────────────────────────────────────

function StatPlayerRow({ rank, player, statKey, statLabel }) {
  const val = player[statKey];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-3/30 last:border-0 hover:bg-surface-3/20 transition-colors">
      <span className={`text-sm font-black w-6 text-right shrink-0 ${rank <= 3 ? "text-amber-400" : "text-zinc-600"}`}>
        {rank}
      </span>
      {(player.team_crest || player.team_logo) && (
        <img src={player.team_crest || player.team_logo} alt="" className="w-5 h-5 object-contain shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-200 truncate">{player.name}</p>
        <p className="text-[10px] text-zinc-600 truncate">{player.team}{player.played ? ` · ${player.played} matchs` : ""}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-lg font-black font-mono ${rank === 1 ? "text-amber-400" : "text-zinc-100"}`}>{val}</p>
        <p className="text-[9px] text-zinc-600 uppercase">{statLabel}</p>
      </div>
    </div>
  );
}

function StatsTable({ title, icon: Icon, players, statKey, statLabel, color = "text-brand-light", scope }) {
  return (
    <div className="bg-surface-2 rounded-xl border border-surface-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className={color} />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{title}</span>
        </div>
        {scope && <span className="text-[10px] text-zinc-600">{scope}</span>}
      </div>
      {players?.length === 0 && <p className="text-center text-xs text-zinc-600 py-6">Aucune donnée</p>}
      {players?.map((p, i) => (
        <StatPlayerRow key={`${p.name}-${i}`} rank={i + 1} player={p} statKey={statKey} statLabel={statLabel} />
      ))}
    </div>
  );
}

function StatsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = () => {
    apiFetch("/api/worldcup/stats")
      .then(d => { setData(d); setLastUpdate(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // refresh auto 60s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 size={18} className="animate-spin text-zinc-600" /></div>;
  if (!data) return <p className="text-center text-zinc-600 py-10">Données non disponibles</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-zinc-600">
          Mise à jour automatique · {lastUpdate ? `dernière update ${lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </p>
        <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 bg-surface-2 border border-surface-3 px-3 py-1 rounded-lg transition-colors">
          <Loader2 size={10} /> Actualiser
        </button>
      </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      <StatsTable
        title="Meilleurs buteurs"
        icon={Target}
        players={data.top_scorers}
        statKey="goals"
        statLabel="buts"
        color="text-success"
      />
      <div>
        <StatsTable
          title="Meilleurs passeurs"
          icon={Footprints}
          players={data.top_assists}
          statKey="assists"
          statLabel="passes D."
          color="text-brand-light"
          scope={data.assists_scope}
        />
        <p className="text-[10px] text-zinc-700 mt-1.5 px-1">
          Données partielles — plan API gratuit limité aux 24-48h récentes. Stats complètes sur plan payant.
        </p>
      </div>
      <div>
        <StatsTable
          title="Meilleures notes"
          icon={Star}
          players={data.top_ratings}
          statKey="avg_rating"
          statLabel="note moy."
          color="text-amber-400"
          scope={data.ratings_scope}
        />
        <p className="text-[10px] text-zinc-700 mt-1.5 px-1">
          Notes basées sur les matchs récents uniquement.
        </p>
      </div>
    </div>
    </div>
  );
}


// ─── MAIN ─────────────────────────────────────────────────

export default function CompetitionSection() {
  const [view, setView] = useState("standings");

  return (
    <div className="h-[calc(100vh-96px)] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-1/90 backdrop-blur-sm border-b border-surface-3 px-6 py-3 flex items-center gap-4">
        <div className="flex gap-1">
          {[["standings", "Classements"], ["bracket", "Tableau"], ["stats", "Stats & Leaders"]].map(([val, label]) => (
            <button key={val} onClick={() => setView(val)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                view === val ? "bg-brand/10 text-brand-light" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {val === "standings" ? <Trophy size={13} /> : null}
              {label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-zinc-600">FIFA World Cup 2026</div>
      </div>

      <div className="px-6 py-5">
        {view === "standings" && <StandingsView />}
        {view === "bracket" && <BracketView />}
        {view === "stats" && <StatsView />}
      </div>
    </div>
  );
}
